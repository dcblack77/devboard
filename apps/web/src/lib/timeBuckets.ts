/**
 * Agregación de elementos fechados en cubos de tiempo (día / semana ISO / mes / año) para las
 * gráficas configurables (`TimeSeriesChart`). Todo se calcula en UTC para que las etiquetas
 * coincidan con las semanas ISO que devuelve la API y no dependan de la zona horaria del navegador.
 */

export type Granularity = 'day' | 'week' | 'month' | 'year';
export type RangePreset = '4w' | '3m' | '6m' | '12m' | 'all' | 'custom';

/** Rango de fechas `YYYY-MM-DD` inclusivo; `null` = sin límite (primera/última fecha con datos). */
export interface DateRange {
  from: string | null;
  to: string | null;
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

/** Fecha (ISO o `YYYY-MM-DD`) de un elemento; `null`/inválida = el elemento no cuenta. */
export type DateAccessor<T> = (item: T) => string | null | undefined;
/** Valor que aporta un elemento a su cubo (por defecto 1 = contar). */
export type ValueAccessor<T> = (item: T) => number;

export interface SeriesSpec<T> {
  date: DateAccessor<T>;
  value?: ValueAccessor<T>;
}

/** Varias series sobre el mismo eje: `values[s][i]` es el valor de la serie `s` en el cubo `i`. */
export interface SeriesBuckets {
  keys: string[];
  labels: string[];
  values: number[][];
  totals: number[];
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` (UTC) de una fecha. */
export function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/** Lunes (00:00 UTC) de la semana ISO de la fecha. */
function mondayOf(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // 0 = lunes
  return new Date(day.getTime() - dow * DAY_MS);
}

/** Semana ISO 8601 (`2026-W05`): semanas de lunes a domingo, la W01 contiene el primer jueves. */
export function isoWeek(d: Date): string {
  const thursday = new Date(mondayOf(d).getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return `${year}-W${pad(week)}`;
}

/** Clave ordenable del cubo al que pertenece la fecha. */
export function bucketKey(d: Date, g: Granularity): string {
  switch (g) {
    case 'day':
      return ymd(d);
    case 'week':
      return isoWeek(d);
    case 'month':
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    case 'year':
      return String(d.getUTCFullYear());
  }
}

/** Etiqueta del eje: día `dd-mm-aa`, semana `2026-W05`, mes `mm-aaaa`, año `aaaa`. */
export function bucketLabel(key: string, g: Granularity): string {
  if (g === 'day') {
    const [y, m, d] = key.split('-');
    return `${d}-${m}-${y!.slice(2)}`;
  }
  if (g === 'month') {
    const [y, m] = key.split('-');
    return `${m}-${y}`;
  }
  return key;
}

/** Avanza la fecha al inicio del siguiente cubo. */
function nextStart(d: Date, g: Granularity): Date {
  switch (g) {
    case 'day':
      return new Date(d.getTime() + DAY_MS);
    case 'week':
      return new Date(mondayOf(d).getTime() + 7 * DAY_MS);
    case 'month':
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    case 'year':
      return new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1));
  }
}

/** Rango de un preset terminando en `today` (inclusive). `all` no tiene inicio. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: Date = new Date()): DateRange {
  const to = ymd(today);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();
  switch (preset) {
    case '4w':
      return { from: ymd(new Date(Date.UTC(y, m, d) - 28 * DAY_MS)), to };
    case '3m':
      return { from: ymd(new Date(Date.UTC(y, m - 3, d))), to };
    case '6m':
      return { from: ymd(new Date(Date.UTC(y, m - 6, d))), to };
    case '12m':
      return { from: ymd(new Date(Date.UTC(y, m - 12, d))), to };
    case 'all':
      return { from: null, to };
  }
}

/** Claves continuas (incluye cubos vacíos) entre dos instantes inclusive. */
function keysBetween(startMs: number, endMs: number, g: Granularity): string[] {
  const out: string[] = [];
  const endKey = bucketKey(new Date(endMs), g);
  let cur = new Date(startMs);
  for (let guard = 0; guard < 20_000; guard++) {
    const key = bucketKey(cur, g);
    out.push(key);
    if (key === endKey) break;
    cur = nextStart(cur, g);
  }
  return out;
}

/**
 * Agrega varias series sobre un eje común dentro del rango (extremos inclusivos, por día UTC).
 * Incluye los cubos vacíos con 0 para que el eje sea continuo. Sin `from`/`to` se usa la
 * primera/última fecha de cualquiera de las series.
 */
export function bucketSeries<T>(
  items: ReadonlyArray<T>,
  series: ReadonlyArray<SeriesSpec<T>>,
  g: Granularity,
  range: DateRange,
): SeriesBuckets {
  const fromMs = range.from ? parseYmd(range.from).getTime() : -Infinity;
  const toMs = range.to ? parseYmd(range.to).getTime() + DAY_MS : Infinity; // exclusivo
  let minMs = Infinity;
  let maxMs = -Infinity;
  const sums = series.map((spec) => {
    const m = new Map<string, number>();
    for (const item of items) {
      const raw = spec.date(item);
      if (!raw) continue;
      const t = new Date(raw);
      const ms = t.getTime();
      if (Number.isNaN(ms) || ms < fromMs || ms >= toMs) continue;
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
      const k = bucketKey(t, g);
      m.set(k, (m.get(k) ?? 0) + (spec.value ? spec.value(item) : 1));
    }
    return m;
  });

  const startMs = range.from ? fromMs : minMs;
  const endMs = range.to ? toMs - 1 : maxMs;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return { keys: [], labels: [], values: series.map(() => []), totals: series.map(() => 0) };
  }
  const keys = keysBetween(startMs, endMs, g);
  const values = sums.map((m) => keys.map((k) => m.get(k) ?? 0));
  return {
    keys,
    labels: keys.map((k) => bucketLabel(k, g)),
    values,
    totals: values.map((v) => v.reduce((s, n) => s + n, 0)),
  };
}

/** Una sola serie: cuenta (o suma `value`) los elementos por cubo a partir de `date`. */
export function bucketItems<T>(
  items: ReadonlyArray<T>,
  date: DateAccessor<T>,
  g: Granularity,
  range: DateRange,
  value?: ValueAccessor<T>,
): Bucket[] {
  const s = bucketSeries(items, [{ date, value }], g, range);
  return s.keys.map((key, i) => ({ key, label: s.labels[i]!, count: s.values[0]![i]! }));
}
