/**
 * Cliente Jira Cloud REST v3 (auth Basic email:token). Sin dependencias del
 * esqueleto: usa fetch nativo (Node 22). Timeout, reintentos en 429/5xx con
 * Retry-After, y paginación completa (nextPageToken / startAt).
 */
import type {
  JiraConfig,
  JiraRawIssue,
  JiraSearchResponse,
  JiraChangelogPageResponse,
  JiraChangelogHistory,
  EpicWithChildren,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;

export class JiraApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'JiraApiError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.authHeader =
      config.authMode === 'bearer'
        ? `Bearer ${config.apiToken}`
        : 'Basic ' + Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /** GET con timeout + reintentos en 429/5xx respetando Retry-After. */
  private async request(path: string): Promise<Response> {
    const url = `${this.baseUrl}/rest/api/3/${path}`;
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          headers: {
            Authorization: this.authHeader,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) {
          if (attempt >= this.maxRetries) {
            const body = await res.text().catch(() => undefined);
            throw new JiraApiError(`Jira API error ${res.status} at ${path}`, res.status, body);
          }
          const retryAfterHeader = res.headers.get('Retry-After');
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
          const backoffMs = retryAfterMs || 2 ** attempt * 500;
          attempt += 1;
          await sleep(backoffMs);
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => undefined);
          throw new JiraApiError(`Jira API error ${res.status} at ${path}`, res.status, body);
        }
        return res;
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof JiraApiError) throw err;
        // errores de red/timeout: reintenta igual que 5xx
        if (attempt >= this.maxRetries) throw err;
        attempt += 1;
        await sleep(2 ** attempt * 500);
      }
    }
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.request(path);
    return (await res.json()) as T;
  }

  /**
   * Búsqueda paginada por JQL (search/jql, nextPageToken). Devuelve todos los
   * issues acumulados. Si expand incluye 'changelog', completa el changelog
   * truncado (>100 entradas) por issue con fetchFullChangelog.
   */
  async searchAll(jql: string, fields: string[], opts: { expand?: string } = {}): Promise<JiraRawIssue[]> {
    const out: JiraRawIssue[] = [];
    let pageToken: string | undefined;
    const fieldsParam = fields.join(',');
    for (;;) {
      let q = `search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=${encodeURIComponent(fieldsParam)}`;
      if (opts.expand) q += `&expand=${encodeURIComponent(opts.expand)}`;
      if (pageToken) q += `&nextPageToken=${encodeURIComponent(pageToken)}`;
      const data = await this.getJson<JiraSearchResponse>(q);
      out.push(...data.issues);
      pageToken = data.nextPageToken;
      if (!pageToken || data.isLast) break;
    }

    if (opts.expand?.includes('changelog')) {
      for (const issue of out) {
        const cl = issue.changelog;
        if (cl && (cl.total ?? 0) > cl.histories.length) {
          issue.changelog = { total: cl.total, histories: await this.fullChangelog(issue.key) };
        }
      }
    }
    return out;
  }

  /** Changelog completo de un issue, paginado por startAt/isLast. */
  async fullChangelog(key: string): Promise<JiraChangelogHistory[]> {
    const out: JiraChangelogHistory[] = [];
    let startAt = 0;
    for (;;) {
      const data = await this.getJson<JiraChangelogPageResponse>(
        `issue/${encodeURIComponent(key)}/changelog?maxResults=1000&startAt=${startAt}`,
      );
      out.push(...data.values);
      const total = data.total ?? out.length;
      startAt += data.values.length;
      if (data.isLast || data.values.length === 0 || startAt >= total) break;
    }
    return out;
  }

  /** Épicas del proyecto + hijos (sin ventana temporal), agrupados por épica. */
  async epicsWithChildren(project: string): Promise<EpicWithChildren[]> {
    const epics = await this.searchAll(
      `project = ${project} AND issuetype = Epic ORDER BY created ASC`,
      ['summary', 'status', 'assignee', 'created'],
    );
    const children = await this.searchAll(
      `project = ${project} AND issuetype != Epic AND parent is not EMPTY ORDER BY created ASC`,
      ['summary', 'status', 'assignee', 'issuetype', 'parent', 'resolutiondate'],
    );

    const idx = new Map<string, EpicWithChildren>();
    for (const e of epics) {
      idx.set(e.key, {
        key: e.key,
        summary: e.fields.summary,
        status: e.fields.status.name,
        assigneeRaw: e.fields.assignee?.displayName ?? null,
        createdAt: e.fields.created ? new Date(e.fields.created) : null,
        children: [],
      });
    }
    for (const c of children) {
      const parentKey = c.fields.parent?.key;
      if (!parentKey) continue;
      const epic = idx.get(parentKey);
      if (!epic) continue;
      epic.children.push({
        key: c.key,
        summary: c.fields.summary,
        type: c.fields.issuetype.name,
        status: c.fields.status.name,
        assigneeRaw: c.fields.assignee?.displayName ?? null,
      });
    }
    return [...idx.values()];
  }

  /** Ventana temporal: issues actualizados desde sinceDate, con changelog completo. */
  async fetchWindow(project: string, sinceDate: string): Promise<JiraRawIssue[]> {
    return this.searchAll(
      `project = ${project} AND updated >= "${sinceDate}" ORDER BY created ASC`,
      ['summary', 'status', 'assignee', 'issuetype', 'created', 'resolutiondate', 'parent', 'priority'],
      { expand: 'changelog' },
    );
  }
}
