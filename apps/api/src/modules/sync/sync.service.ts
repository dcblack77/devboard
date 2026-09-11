import { desc, eq } from 'drizzle-orm';
import { SyncSource } from '@devboard/shared';
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
export class SyncService {
  async runAll(): Promise<void> {
    try {
      const registered = getRegisteredSources();
      const sources = registered.length > 0 ? registered : null;

      if (sources) {
        for (const source of sources) {
          await this.runOne(source.name, () => source.run());
        }
        return;
      }

      // Esqueleto Fase 1: sin integraciones reales todavía, solo dejamos constancia de la
      // ejecución para que `/api/sync/status` tenga datos y el scheduler quede verificable.
      for (const name of PLACEHOLDER_SOURCE_NAMES) {
        await this.runOne(name, async () => ({ counts: {} }));
      }
    } finally {
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
}
