import type { KpiDelta } from '../components/Kpi';

/**
 * Deltas de KPIs a partir de series semanales en orden cronológico (p. ej. `reviewStats.weekly`).
 * Nunca se inventa un delta: sin histórico suficiente o con periodo anterior 0 se devuelve `null`.
 */

type NumericKeys<T> = { [K in keyof T]: T[K] extends number | null | undefined ? K : never }[keyof T];

const sum = <T>(rows: ReadonlyArray<T>, key: NumericKeys<T>) =>
  rows.reduce((s, r) => s + (Number(r[key] ?? 0) || 0), 0);

/** Suma de `key` en las `n` últimas filas. */
export function sumLastWindow<T>(rows: ReadonlyArray<T>, key: NumericKeys<T>, n = 4): number {
  return sum(rows.slice(-n), key);
}

/** Suma de `key` en las `n` filas anteriores a las `n` últimas. */
export function sumPrevWindow<T>(rows: ReadonlyArray<T>, key: NumericKeys<T>, n = 4): number {
  return sum(rows.slice(-2 * n, -n), key);
}

/**
 * Variación (%) de las `n` últimas filas frente a las `n` anteriores. `null` si no hay `2n`
 * filas o el periodo anterior suma 0.
 */
export function windowDelta<T>(rows: ReadonlyArray<T>, key: NumericKeys<T>, n = 4): number | null {
  if (rows.length < 2 * n) return null;
  const prev = sumPrevWindow(rows, key, n);
  if (prev === 0) return null;
  return ((sumLastWindow(rows, key, n) - prev) / prev) * 100;
}

/** `pct` → prop `delta` de `Kpi` (`good` = dirección buena). */
export const toDelta = (pct: number | null, good: KpiDelta['good']): KpiDelta | null =>
  pct === null ? null : { pct, good };
