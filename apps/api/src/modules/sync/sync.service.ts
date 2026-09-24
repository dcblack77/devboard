import { and, desc, eq } from 'drizzle-orm';
import { SyncSource, type SyncStateDto } from '@devboard/shared';
import { getDb } from '../../db/client.js';
import { syncRuns } from '../../db/schema.js';
import { logger } from '../../config/logger.js';
import { getRegisteredSources } from './registry.js';
import { invalidateMetricsContext } from '../../domain/context.js';

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

export class SyncService {
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

  private async runOne(
    source: string,
    execute: () => Promise<{ counts: Record<string, number> }>,
  ): Promise<void> {
    const db = getDb();
    const startedAt = new Date();
    const [row] = await db
      .insert(syncRuns)
      .values({ source, startedAt, ok: null, counts: {} })
      .returning({ id: syncRuns.id });

    try {
      const result = await execute();
      await db
        .update(syncRuns)
        .set({ finishedAt: new Date(), ok: true, counts: result.counts })
        .where(eq(syncRuns.id, row.id));
      logger.info({ source, counts: result.counts }, 'sync run completado');
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await db
        .update(syncRuns)
        .set({ finishedAt: new Date(), ok: false, error })
        .where(eq(syncRuns.id, row.id));
      logger.error({ source, error }, 'sync run falló');
    }
  }

  async latestRuns(limit = 20) {
    const db = getDb();
    return db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit);
  }

  /**
   * Frescura por fuente: fin de la última sync correcta y resultado de la última ejecución.
   * Las fuentes salen de las registradas (o las placeholder si no hay ninguna).
   */
  async state(): Promise<SyncStateDto> {
    const db = getDb();
    const registered = getRegisteredSources().map((s) => s.name);
    const names = registered.length > 0 ? registered : PLACEHOLDER_SOURCE_NAMES;
    const sources = await Promise.all(
      names.map(async (source) => {
        const [lastOk] = await db
          .select({ finishedAt: syncRuns.finishedAt })
          .from(syncRuns)
          .where(and(eq(syncRuns.source, source), eq(syncRuns.ok, true)))
          .orderBy(desc(syncRuns.startedAt))
          .limit(1);
        const [last] = await db
          .select({ ok: syncRuns.ok, error: syncRuns.error })
          .from(syncRuns)
          .where(eq(syncRuns.source, source))
          .orderBy(desc(syncRuns.startedAt))
          .limit(1);
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
}
