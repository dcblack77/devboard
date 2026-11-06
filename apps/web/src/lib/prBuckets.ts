/**
 * Agregación de PRs mergeadas en cubos de tiempo (día / semana ISO / mes / año) para la
 * gráfica de Code review. Todo se calcula en UTC para que las etiquetas coincidan con las
 * semanas ISO que devuelve la API y no dependan de la zona horaria del navegador.
 */

export type Granularity = 'day' | 'week' | 'month' | 'year';
export type RangePreset = '4w' | '3m' | '6m' | '12m' | 'all' | 'custom';

/** Rango de fechas `YYYY-MM-DD` inclusivo; `null` = sin límite (primera/última mergeada). */
export interface DateRange {
  from: string | null;
  to: string | null;
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
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

/**
 * Cuenta las PRs mergeadas por cubo dentro del rango (extremos inclusivos, por día UTC).
 * Incluye los cubos vacíos con 0 para que el eje sea continuo. Sin `from`/`to` se usa la
 * primera/última fecha de merge.
 */
export function bucketMerged(
  prs: ReadonlyArray<{ merged: string | null }>,
  g: Granularity,
  range: DateRange,
): Bucket[] {
  const fromMs = range.from ? parseYmd(range.from).getTime() : -Infinity;
  const toMs = range.to ? parseYmd(range.to).getTime() + DAY_MS : Infinity; // exclusivo
  const dates: Date[] = [];
  for (const p of prs) {
    if (!p.merged) continue;
    const t = new Date(p.merged);
    const ms = t.getTime();
    if (Number.isNaN(ms) || ms < fromMs || ms >= toMs) continue;
    dates.push(t);
  }

  const startMs = range.from ? fromMs : Math.min(...dates.map((d) => d.getTime()));
  const endMs = range.to ? toMs - 1 : Math.max(...dates.map((d) => d.getTime()));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return [];

  const counts = new Map<string, number>();
  for (const d of dates) {
    const k = bucketKey(d, g);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const out: Bucket[] = [];
  const endKey = bucketKey(new Date(endMs), g);
  let cur = new Date(startMs);
  for (let guard = 0; guard < 20_000; guard++) {
    const key = bucketKey(cur, g);
    out.push({ key, label: bucketLabel(key, g), count: counts.get(key) ?? 0 });
    if (key === endKey) break;
    cur = nextStart(cur, g);
  }
  return out;
}
