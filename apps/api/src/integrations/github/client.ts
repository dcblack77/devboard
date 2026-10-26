/**
 * Cliente GraphQL de GitHub. Sin dependencias del esqueleto: usa fetch
 * nativo (Node 22). Auth por PAT en `Authorization: Bearer`, timeout 40s,
 * 4 reintentos en 502/503/504/errores de red (igual que
 * workspace/team-board/github_reviews.py::gql). Expone `searchPullRequests`
 * como async generator que pagina con `pageInfo.endCursor` (first:50) y
 * duerme antes de la siguiente petición si `rateLimit.remaining` < 50.
 */
import { SEARCH_PRS_QUERY } from './queries.js';
import type { GithubConfig, PrNode, SearchResponse } from './types.js';

const DEFAULT_TIMEOUT_MS = 40_000;
const DEFAULT_MAX_RETRIES = 4;
const RATE_LIMIT_LOW_WATERMARK = 50;
const GRAPHQL_URL = 'https://api.github.com/graphql';

export class GithubApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'GithubApiError';
  }
}

/** Token inválido/revocado (401) o GraphQL sin datos en `viewer`. */
export class GithubAuthError extends GithubApiError {
  constructor(status: number | undefined, body?: string) {
    super(
      `GitHub ${status ?? 'auth'}: credenciales inválidas o caducadas (GITHUB_TOKEN)`,
      status,
      body,
    );
    this.name = 'GithubAuthError';
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export class GithubClient {
  private readonly token: string;
  readonly org: string;
  readonly repos: string[];
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly nowFn: () => Date;
  private apiCallCount = 0;

  /**
   * Número de peticiones GraphQL de datos (búsquedas) efectivamente enviadas, para
   * contadores de sync. La sonda `whoAmI()` NO cuenta: así `apiCalls === 0` significa
   * "no se hizo ninguna búsqueda" (guard de run vacío en `sync.service.ts`).
   */
  get apiCalls(): number {
    return this.apiCallCount;
  }

  constructor(config: GithubConfig) {
    this.token = config.token;
    this.org = config.org;
    this.repos = config.repos;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sleepImpl = config.sleepImpl ?? defaultSleep;
    this.nowFn = config.now ?? (() => new Date());
  }

  /** POST GraphQL con timeout + reintentos en 502/503/504/red (backoff 2 + 3*attempt s, como la referencia). */
  async gql<T>(query: string, variables: Record<string, unknown>, opts: { count?: boolean } = {}): Promise<T> {
    const count = opts.count ?? true;
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        if (count) this.apiCallCount += 1;
        const res = await this.fetchImpl(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'devboard',
          },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (RETRYABLE_STATUSES.has(res.status)) {
          if (attempt >= this.maxRetries - 1) {
            const body = await res.text().catch(() => undefined);
            throw new GithubApiError(`GitHub GraphQL error ${res.status}`, res.status, body);
          }
          await this.sleepImpl((2 + 3 * attempt) * 1000);
          attempt += 1;
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => undefined);
          throw new GithubApiError(`GitHub GraphQL error ${res.status}`, res.status, body);
        }
        const data = (await res.json()) as { data?: T; errors?: unknown };
        if (data.errors && !data.data) {
          throw new GithubApiError(`GitHub GraphQL errors: ${JSON.stringify(data.errors)}`);
        }
        return data.data as T;
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof GithubApiError) throw err;
        // errores de red/timeout: reintenta igual que 502/503/504
        if (attempt >= this.maxRetries - 1) throw err;
        await this.sleepImpl((2 + 3 * attempt) * 1000);
        attempt += 1;
      }
    }
  }

  /**
   * GET REST (`https://api.github.com/...`) con los mismos timeout/reintentos que `gql`.
   * 401 → GithubAuthError; otros estados no-2xx → GithubApiError. Cuenta en `apiCalls`.
   */
  async rest<T>(url: string): Promise<T> {
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        this.apiCallCount += 1;
        const res = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'devboard',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (RETRYABLE_STATUSES.has(res.status)) {
          if (attempt >= this.maxRetries - 1) {
            const body = await res.text().catch(() => undefined);
            throw new GithubApiError(`GitHub REST error ${res.status}`, res.status, body);
          }
          await this.sleepImpl((2 + 3 * attempt) * 1000);
          attempt += 1;
          continue;
        }
        if (res.status === 401) {
          const body = await res.text().catch(() => undefined);
          throw new GithubAuthError(401, body);
        }
        if (!res.ok) {
          const body = await res.text().catch(() => undefined);
          throw new GithubApiError(`GitHub REST error ${res.status}`, res.status, body);
        }
        return (await res.json()) as T;
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof GithubApiError) throw err;
        if (attempt >= this.maxRetries - 1) throw err;
        await this.sleepImpl((2 + 3 * attempt) * 1000);
        attempt += 1;
      }
    }
  }

  /**
   * Sonda de autenticación: `viewer { login }`. Un PAT revocado devuelve 401;
   * un token sin permisos puede devolver 200 con `errors` y sin `data`.
   */
  async whoAmI(): Promise<{ login: string }> {
    let data: { viewer?: { login?: string } | null } | undefined;
    try {
      data = await this.gql<{ viewer?: { login?: string } | null }>('query { viewer { login } }', {}, { count: false });
    } catch (err) {
      if (err instanceof GithubApiError && (err.status === 401 || err.status === undefined)) {
        throw new GithubAuthError(err.status, err.body ?? err.message);
      }
      throw err;
    }
    const login = data?.viewer?.login;
    if (!login) throw new GithubAuthError(undefined, JSON.stringify(data));
    return { login };
  }

  /**
   * Pagina `search(type:ISSUE)` para una query dada, cediendo cada PrNode.
   * Si `rateLimit.remaining` cae por debajo de 50, duerme hasta `resetAt`
   * antes de pedir la siguiente página.
   */
  async *searchPullRequests(query: string): AsyncGenerator<PrNode> {
    let after: string | null = null;
    for (;;) {
      const data: SearchResponse = await this.gql<SearchResponse>(SEARCH_PRS_QUERY, { q: query, after });
      for (const node of data.search.nodes) {
        if (node) yield node;
      }
      const { rateLimit } = data;
      if (rateLimit && rateLimit.remaining < RATE_LIMIT_LOW_WATERMARK) {
        const resetAt = new Date(rateLimit.resetAt).getTime();
        const waitMs = resetAt - this.nowFn().getTime();
        if (waitMs > 0) await this.sleepImpl(waitMs);
      }
      if (!data.search.pageInfo.hasNextPage) break;
      after = data.search.pageInfo.endCursor;
    }
  }
}
