/**
 * Orquesta la sincronización de Jira: descarga ventana + épicas, parsea
 * segmentos, y hace upsert en Postgres vía JiraRepo.
 */
import { JiraClient } from './client.js';
import { parseIssue } from './parse.js';
import { toIssueUpsertInput, toEpicUpsertInput } from './repo.js';
import type { JiraRepo } from './repo.js';
import type { JiraConfig, StatusAliasMap } from './types.js';
import type { SourceSync } from '../../modules/sync/registry.js';

export type { SourceSync };

export interface JiraSyncSettings {
  project: string;
  /** Fecha ISO (YYYY-MM-DD) o expresión relativa tipo "-30d" para la ventana. */
  sinceDate: string;
  statusAliases: StatusAliasMap;
  macroMap: Record<string, string>;
  finalStatus: string;
}

export interface JiraSyncDeps {
  config: JiraConfig;
  settings: JiraSyncSettings;
  repo: JiraRepo;
  client?: JiraClient;
  now?: Date;
}

export class JiraSync implements SourceSync {
  readonly name = 'jira';
  private readonly client: JiraClient;
  private readonly settings: JiraSyncSettings;
  private readonly repo: JiraRepo;
  private readonly now?: Date;

  constructor(deps: JiraSyncDeps) {
    this.client = deps.client ?? new JiraClient(deps.config);
    this.settings = deps.settings;
    this.repo = deps.repo;
    this.now = deps.now;
  }

  async run(): Promise<{ counts: Record<string, number> }> {
    const { project, sinceDate, statusAliases, macroMap, finalStatus } = this.settings;

    // Sonda de auth antes de nada: con token revocado Jira devuelve 200 y 0 issues
    // (acceso anónimo), lo que dejaría un run ok=true vacío. /myself sí falla (401).
    await this.client.whoAmI();

    const [windowIssues, epicIndex] = await Promise.all([
      this.client.fetchWindow(project, sinceDate),
      this.client.epicsWithChildren(project),
    ]);

    // épicas a las que pertenece cada issue (para epicKey en `issues`)
    const parentEpicByChildKey = new Map<string, string>();
    for (const epic of epicIndex) {
      for (const child of epic.children) {
        parentEpicByChildKey.set(child.key, epic.key);
      }
    }

    let changelogsFetched = 0;
    const upsertInputs = windowIssues.map((raw) => {
      const parsed = parseIssue(raw, { aliases: statusAliases, finalStatus, now: this.now });
      if (raw.changelog) changelogsFetched += 1;
      const statusNorm = parsed.segments.at(-1)?.status ?? parsed.statusRaw;
      const macro = macroMap[statusNorm] ?? 'pendiente';
      const epicKey = parentEpicByChildKey.get(parsed.key) ?? (parsed.parentType === 'Epic' ? parsed.parentKey : null);
      return { parsed, upsert: toIssueUpsertInput(parsed, { statusNorm, macro, epicKey }) };
    });

    await this.repo.upsertIssues(upsertInputs.map((u) => u.upsert));

    for (const { parsed } of upsertInputs) {
      await this.repo.replaceSegments(
        parsed.key,
        parsed.segments.map((s) => ({ status: s.status, startedAt: s.startedAt, endedAt: s.endedAt, seq: s.seq })),
      );
      await this.repo.replaceAssigneeChanges(
        parsed.key,
        parsed.assigneeChanges.map((c) => ({ at: c.at, toRaw: c.to })),
      );
    }

    await this.repo.upsertEpics(epicIndex.map(toEpicUpsertInput));

    const childrenCount = epicIndex.reduce((acc, e) => acc + e.children.length, 0);

    return {
      counts: {
        issues: windowIssues.length,
        epics: epicIndex.length,
        children: childrenCount,
        changelogsFetched,
      },
    };
  }
}
