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
import { reconcileInitiativesFromEpics } from '../../domain/initiatives/auto-from-epics.js';

/** Subconjunto de pino que usa el sync; inyectable para que el módulo no cargue env al importarse. */
export interface SyncLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

/** Postgres `unique_violation`. */
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION;
}

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
  logger?: SyncLogger;
}

export class JiraSync implements SourceSync {
  readonly name = 'jira';
  private readonly client: JiraClient;
  private readonly settings: JiraSyncSettings;
  private readonly repo: JiraRepo;
  private readonly now?: Date;
  private readonly logger?: SyncLogger;

  constructor(deps: JiraSyncDeps) {
    this.client = deps.client ?? new JiraClient(deps.config);
    this.settings = deps.settings;
    this.repo = deps.repo;
    this.now = deps.now;
    this.logger = deps.logger;
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

    // Iniciativas = épicas: una iniciativa `auto` por épica sin agrupar; las `auto` siguen
    // el summary de su épica. Ver domain/initiatives/auto-from-epics.ts.
    const { initiatives, initiativeEpics } = await this.repo.listInitiativesWithEpics();
    const plan = reconcileInitiativesFromEpics({
      epics: epicIndex.map((e) => ({ key: e.key, summary: e.summary })),
      initiatives,
      initiativeEpics,
    });
    // El reconciliador ya evita colisiones de slug, pero una carrera con Settings (TL crea una
    // manual con ese slug entre el listado y el insert) no debe marcar el run ok=false para siempre.
    let initiativesCreated = 0;
    const skippedEpics: string[] = [];
    for (const c of plan.toCreate) {
      try {
        await this.repo.createAutoInitiative(c);
        initiativesCreated += 1;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        skippedEpics.push(c.epicKey);
      }
    }
    if (skippedEpics.length > 0) {
      this.logger?.warn({ epics: skippedEpics }, 'jira sync: slug de iniciativa auto ya en uso; épicas saltadas hasta el siguiente sync');
    }
    for (const r of plan.toRename) await this.repo.renameInitiative(r.id, r.name);

    const childrenCount = epicIndex.reduce((acc, e) => acc + e.children.length, 0);

    return {
      counts: {
        issues: windowIssues.length,
        epics: epicIndex.length,
        children: childrenCount,
        changelogsFetched,
        initiativesCreated,
        initiativesSkipped: skippedEpics.length,
        initiativesRenamed: plan.toRename.length,
      },
    };
  }
}
