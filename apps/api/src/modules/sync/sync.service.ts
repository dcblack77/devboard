import { SyncSource, type SyncHealthDto, type SyncSourceHealthDto, type SyncStateDto } from '@devboard/shared';
import { logger } from '../../config/logger.js';
import { getRegisteredSources } from './registry.js';
import { invalidateMetricsContext } from '../../domain/context.js';
import { DrizzleSyncRunsRepo, type SyncRunsRepo, type SyncRunRow } from './sync-runs.repo.js';
import { SkillsService } from '../skills/skills.service.js';

/** Si no hay settings, intervalo por defecto del scheduler (minutos). */
const DEFAULT_SYNC_MINUTES = 30;
/** Una fuente está "stale" si no hay run ok en este múltiplo del intervalo de sync. */
const STALE_FACTOR = 3;

/** Fuentes placeholder usadas mientras no haya integraciones reales registradas (Fase 1). */
const PLACEHOLDER_SOURCE_NAMES: string[] = [SyncSource.Jira, SyncSource.GitHub];

/**
 * Orquesta la sincronización de todas las fuentes registradas (Jira, GitHub, ...).
 * Cada fuente se ejecuta de forma independiente: un fallo en una no aborta las demás.
 * Cada ejecución (éxito o error) deja una fila en `sync_runs`.
 */
/** Evita dos sincronizaciones solapadas (botón + cron, o dos clics). Por proceso. */
let running = false;

/** `true` mientras hay una sincronización en curso en este proceso. */
export function isSyncRunning(): boolean {
  return running;
}

/**
 * Un run "vacío" tras uno que trajo datos es sospechoso (credencial caducada,
 * proyecto sin acceso: Jira responde 200 con `issues: []` en acceso anónimo).
 * Devuelve el mensaje de error si debe marcarse como fallo, o null si es legítimo.
 */
export function detectSuspiciousZeroRun(
  source: string,
  counts: Record<string, number>,
  lastOk: Record<string, number> | null,
): string | null {
  if (source === SyncSource.Jira) {
    const prev = lastOk?.issues ?? 0;
    if (prev > 0 && (counts.issues ?? 0) === 0) {
      return `sync jira: 0 issues cuando la última ejecución correcta trajo ${prev}; posible credencial caducada o proyecto sin acceso`;
    }
    return null;
  }
  if (source === SyncSource.GitHub) {
    // El sync de GitHub es incremental: 0 PRs nuevas es normal. Solo es sospechoso
    // que no se haya hecho ninguna llamada a la API.
    if (lastOk && (counts.apiCalls ?? 0) === 0) {
      return 'sync github: 0 llamadas a la API; posible credencial caducada o configuración vacía';
    }
    return null;
  }
  // Soporte: un tablero nuevo puede estar vacío y el incremental suele traer 0; la auth ya
  // la valida `whoAmI()` antes de buscar.
  return null;
}

export class SyncService {
  constructor(private readonly runs: SyncRunsRepo = new DrizzleSyncRunsRepo()) {}

  /**
   * Sincroniza todas las fuentes. Devuelve `false` sin hacer nada si ya había una en curso.
   */
  async runAll(): Promise<boolean> {
    if (running) return false;
    running = true;
    try {
      const registered = getRegisteredSources();
      const sources = registered.length > 0 ? registered : null;

      if (sources) {
        for (const source of sources) {
          await this.runOne(source.name, () => source.run());
        }
        await this.recomputeSkills();
        return true;
      }

      // Esqueleto Fase 1: sin integraciones reales todavía, solo dejamos constancia de la
      // ejecución para que `/api/sync/status` tenga datos y el scheduler quede verificable.
      for (const name of PLACEHOLDER_SOURCE_NAMES) {
        await this.runOne(name, async () => ({ counts: {} }));
      }
      return true;
    } finally {
      running = false;
      // El contexto de métricas cacheado (Fase 2) queda obsoleto tras cualquier sync,
      // haya tenido éxito o no (los datos de las fuentes que sí funcionaron ya están en DB).
      invalidateMetricsContext();
    }
  }

  /**
   * Recalcula las skills de dominio (repos / épicas) tras el sync. Nunca tumba el sync: un
   * fallo aquí solo deja traza en el log.
   */
  private async recomputeSkills(): Promise<void> {
    try {
      const result = await new SkillsService().recompute();
      logger.info(result, 'skills de dominio recalculadas tras el sync');
    } catch (err) {
      logger.error({ err }, 'no se pudieron recalcular las skills tras el sync');
    }
  }

  async runOne(source: string, execute: () => Promise<{ counts: Record<string, number> }>): Promise<void> {
    const startedAt = new Date();
    const id = await this.runs.insertStart(source, startedAt);

    try {
      const result = await execute();
      const lastOk = await this.runs.lastOkCounts(source);
      const suspicious = detectSuspiciousZeroRun(source, result.counts, lastOk);
      if (suspicious) {
        await this.runs.finish(id, { finishedAt: new Date(), ok: false, counts: result.counts, error: suspicious });
        logger.error({ source, counts: result.counts, error: suspicious }, 'sync run marcado como fallido');
        return;
      }
      await this.runs.finish(id, { finishedAt: new Date(), ok: true, counts: result.counts });
      logger.info({ source, counts: result.counts }, 'sync run completado');
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.runs.finish(id, { finishedAt: new Date(), ok: false, error });
      logger.error({ source, error }, 'sync run falló');
    }
  }

  async latestRuns(limit = 20): Promise<SyncRunRow[]> {
    return this.runs.latest(limit);
  }

  /**
   * Frescura por fuente: fin de la última sync correcta y resultado de la última ejecución.
   * Las fuentes salen de las registradas (o las placeholder si no hay ninguna).
   */
  async state(): Promise<SyncStateDto> {
    const registered = getRegisteredSources().map((s) => s.name);
    const names = registered.length > 0 ? registered : PLACEHOLDER_SOURCE_NAMES;
    const sources = await Promise.all(
      names.map(async (source) => {
        const [lastOk, last] = await Promise.all([this.runs.lastOkRun(source), this.runs.lastRun(source)]);
        return {
          source,
          lastOkAt: lastOk?.finishedAt ? lastOk.finishedAt.toISOString() : null,
          lastRunOk: last?.ok ?? null,
          lastError: last?.error ?? null,
        };
      }),
    );
    return { running: isSyncRunning(), sources };
  }

  /**
   * Salud por fuente para `/api/sync/status`: `stale` si la última ejecución falló o
   * la última correcta es más antigua que 3 × `settings.syncMinutes`.
   */
  async health(now: Date = new Date()): Promise<SyncHealthDto> {
    const minutes = (await this.runs.syncMinutes()) ?? DEFAULT_SYNC_MINUTES;
    const maxAgeMs = STALE_FACTOR * minutes * 60_000;
    const one = async (source: string): Promise<SyncSourceHealthDto> => {
      const [lastOk, last] = await Promise.all([this.runs.lastOkRun(source), this.runs.lastRun(source)]);
      const lastOkAt = lastOk?.finishedAt ?? null;
      const lastFailed = last?.ok === false;
      const tooOld = lastOkAt === null || now.getTime() - lastOkAt.getTime() > maxAgeMs;
      return {
        lastOkAt: lastOkAt ? lastOkAt.toISOString() : null,
        stale: lastFailed || tooOld,
        lastError: last?.ok === false ? (last.error ?? null) : null,
      };
    };
    const supportHealth = async (): Promise<SyncSourceHealthDto> => {
      // No registrada (sin credenciales Jira) ⇒ no es un fallo de datos que avisar.
      if (!getRegisteredSources().some((s) => s.name === SyncSource.Support)) {
        return { lastOkAt: null, stale: false, lastError: null };
      }
      const h = await one(SyncSource.Support);
      if (h.lastError !== null) return h;
      // Sin tablero de soporte configurado el run es ok con `skipped: 1`: nunca stale.
      const lastOk = await this.runs.lastOkRun(SyncSource.Support);
      if (lastOk?.counts?.skipped === 1) return { ...h, stale: false };
      return h;
    };
    const [jira, github, support] = await Promise.all([one(SyncSource.Jira), one(SyncSource.GitHub), supportHealth()]);
    return { jira, github, support };
  }
}
