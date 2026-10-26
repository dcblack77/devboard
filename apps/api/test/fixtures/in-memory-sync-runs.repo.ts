import type { SyncRunsRepo, SyncRunRow } from '../../src/modules/sync/sync-runs.repo.js';

/** Implementación en memoria de `SyncRunsRepo` para tests de `SyncService` y del controller. */
export class InMemorySyncRunsRepo implements SyncRunsRepo {
  rows: SyncRunRow[] = [];
  syncMinutesValue: number | null = 30;
  private nextId = 1;

  seed(partial: Partial<SyncRunRow> & { source: string }): SyncRunRow {
    const startedAt = partial.startedAt ?? new Date();
    const row: SyncRunRow = {
      id: this.nextId++,
      source: partial.source,
      startedAt,
      finishedAt: partial.finishedAt ?? new Date(startedAt.getTime() + 1000),
      ok: partial.ok ?? true,
      error: partial.error ?? null,
      counts: partial.counts ?? {},
    };
    this.rows.push(row);
    return row;
  }

  async insertStart(source: string, startedAt: Date): Promise<number> {
    const id = this.nextId++;
    this.rows.push({ id, source, startedAt, finishedAt: null, ok: null, error: null, counts: {} });
    return id;
  }

  async finish(
    id: number,
    result: { finishedAt: Date; ok: boolean; counts?: Record<string, number>; error?: string },
  ): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`row ${id} not found`);
    row.finishedAt = result.finishedAt;
    row.ok = result.ok;
    if (result.counts !== undefined) row.counts = result.counts;
    if (result.error !== undefined) row.error = result.error;
  }

  private sorted(source?: string): SyncRunRow[] {
    return this.rows
      .filter((r) => (source ? r.source === source : true))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id - a.id);
  }

  async lastOkCounts(source: string): Promise<Record<string, number> | null> {
    const row = await this.lastOkRun(source);
    return row ? row.counts : null;
  }

  async lastRun(source: string): Promise<SyncRunRow | null> {
    return this.sorted(source)[0] ?? null;
  }

  async lastOkRun(source: string): Promise<SyncRunRow | null> {
    return this.sorted(source).find((r) => r.ok === true) ?? null;
  }

  async latest(limit: number): Promise<SyncRunRow[]> {
    return this.sorted().slice(0, limit);
  }

  async syncMinutes(): Promise<number | null> {
    return this.syncMinutesValue;
  }
}
