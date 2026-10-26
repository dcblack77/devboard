/**
 * Acceso a `sync_runs` desacoplado de drizzle para poder probar `SyncService`
 * con una implementación en memoria.
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { syncRuns, settings } from '../../db/schema.js';

export interface SyncRunRow {
  id: number;
  source: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  error: string | null;
  counts: Record<string, number>;
}

export interface SyncRunsRepo {
  /** Inserta la fila "en curso" y devuelve su id. */
  insertStart(source: string, startedAt: Date): Promise<number>;
  /** Cierra la fila: ok + counts, o ok=false + error. */
  finish(id: number, result: { finishedAt: Date; ok: boolean; counts?: Record<string, number>; error?: string }): Promise<void>;
  /** `counts` de la última ejecución con ok=true de la fuente, o null si no hay. */
  lastOkCounts(source: string): Promise<Record<string, number> | null>;
  /** Última fila (cualquier estado) de la fuente. */
  lastRun(source: string): Promise<SyncRunRow | null>;
  /** Última fila con ok=true de la fuente. */
  lastOkRun(source: string): Promise<SyncRunRow | null>;
  /** Últimas N filas de todas las fuentes, más recientes primero. */
  latest(limit: number): Promise<SyncRunRow[]>;
  /** `settings.sync_minutes` (fila singleton), o null si no existe. */
  syncMinutes(): Promise<number | null>;
}

function toRow(r: typeof syncRuns.$inferSelect): SyncRunRow {
  return {
    id: r.id,
    source: r.source,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    ok: r.ok,
    error: r.error,
    counts: (r.counts as Record<string, number>) ?? {},
  };
}

export class DrizzleSyncRunsRepo implements SyncRunsRepo {
  async insertStart(source: string, startedAt: Date): Promise<number> {
    const [row] = await getDb()
      .insert(syncRuns)
      .values({ source, startedAt, ok: null, counts: {} })
      .returning({ id: syncRuns.id });
    return row.id;
  }

  async finish(
    id: number,
    result: { finishedAt: Date; ok: boolean; counts?: Record<string, number>; error?: string },
  ): Promise<void> {
    await getDb()
      .update(syncRuns)
      .set({
        finishedAt: result.finishedAt,
        ok: result.ok,
        ...(result.counts !== undefined ? { counts: result.counts } : {}),
        ...(result.error !== undefined ? { error: result.error } : {}),
      })
      .where(eq(syncRuns.id, id));
  }

  async lastOkCounts(source: string): Promise<Record<string, number> | null> {
    const row = await this.lastOkRun(source);
    return row ? row.counts : null;
  }

  async lastRun(source: string): Promise<SyncRunRow | null> {
    const [row] = await getDb()
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.source, source))
      .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
      .limit(1);
    return row ? toRow(row) : null;
  }

  async lastOkRun(source: string): Promise<SyncRunRow | null> {
    const [row] = await getDb()
      .select()
      .from(syncRuns)
      .where(and(eq(syncRuns.source, source), eq(syncRuns.ok, true)))
      .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
      .limit(1);
    return row ? toRow(row) : null;
  }

  async latest(limit: number): Promise<SyncRunRow[]> {
    const rows = await getDb().select().from(syncRuns).orderBy(desc(syncRuns.startedAt), desc(syncRuns.id)).limit(limit);
    return rows.map(toRow);
  }

  async syncMinutes(): Promise<number | null> {
    const [row] = await getDb().select({ syncMinutes: settings.syncMinutes }).from(settings).limit(1);
    return row?.syncMinutes ?? null;
  }
}
