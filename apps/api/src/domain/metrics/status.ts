/**
 * Estadísticas agregadas por estado. Puerto 1:1 de `status_stats()` y
 * `days_by_state_type()` del board Python de referencia.
 */
import { mean } from './time.js';
import type { AnalyzedIssue } from './issues.js';

export interface StatusStat {
  status: string;
  n: number;
  mean: number | null;
  max: number | null;
  openN: number;
  openMean: number | null;
}

/**
 * Tiempo acumulado por issue en cada estado, agrupado por tipo de issue
 * (excluye épicas, igual que el Python original no las considera aquí salvo
 * que se le pasen explícitamente).
 */
export interface DaysByStateEntry {
  media: number | null;
  max: number;
  n: number;
}

export type DaysByStateType = Record<string, Record<string, DaysByStateEntry>>;

/**
 * Media/máx/n de horas pasadas en cada estado (issues no-épica), y de las
 * que están abiertas ahora mismo en ese estado (`open_n`/`open_mean`).
 * `order` respeta `statusFlow` primero y añade el resto alfabéticamente.
 */
export function statusStats(rows: AnalyzedIssue[], now: Date, statusFlow: string[] = []): StatusStat[] {
  const perIssue = new Map<string, number[]>();
  const openNow = new Map<string, number[]>();

  for (const r of rows) {
    if (r.type === 'Epic') continue;
    for (const [status, h] of Object.entries(r.timeInStatus)) {
      const list = perIssue.get(status) ?? [];
      list.push(h);
      perIssue.set(status, list);
    }
    const last = r.segments[r.segments.length - 1];
    if (last && last.endedAt.getTime() === now.getTime()) {
      const list = openNow.get(last.status) ?? [];
      list.push((last.endedAt.getTime() - last.startedAt.getTime()) / 3_600_000);
      openNow.set(last.status, list);
    }
  }

  const known = statusFlow.filter((s) => perIssue.has(s));
  const rest = [...perIssue.keys()].filter((s) => !statusFlow.includes(s)).sort();
  const order = [...known, ...rest];

  return order.map((status) => {
    const values = perIssue.get(status) ?? [];
    const openValues = openNow.get(status) ?? [];
    return {
      status,
      n: values.length,
      mean: mean(values),
      max: values.length ? Math.max(...values) : null,
      openN: openValues.length,
      openMean: mean(openValues),
    };
  });
}

/** `{tipo: {estado: {media, max, n}}}` — tiempo acumulado por issue en cada estado. */
export function daysByStateType(rows: AnalyzedIssue[]): DaysByStateType {
  const acc = new Map<string, Map<string, number[]>>();
  for (const r of rows) {
    const byStatus = acc.get(r.type) ?? new Map<string, number[]>();
    for (const [status, h] of Object.entries(r.timeInStatus)) {
      const list = byStatus.get(status) ?? [];
      list.push(h);
      byStatus.set(status, list);
    }
    acc.set(r.type, byStatus);
  }

  const out: DaysByStateType = {};
  for (const [type, byStatus] of acc.entries()) {
    const entry: Record<string, DaysByStateEntry> = {};
    for (const [status, values] of byStatus.entries()) {
      entry[status] = { media: mean(values), max: Math.max(...values), n: values.length };
    }
    out[type] = entry;
  }
  return out;
}
