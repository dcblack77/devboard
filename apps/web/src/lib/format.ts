/** Utilidades puras de formato/agrupación compartidas por las páginas públicas. */

/** Formatea horas como horas (&lt;24h) o días (&gt;=24h), con un decimal; '—' si no hay dato. */
export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined || Number.isNaN(h)) return '—';
  const value = Math.abs(h) < 0.05 ? 0 : h;
  if (value < 24) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} d`;
}

/** Formatea un porcentaje entero con signo '%'; '—' si no hay dato. */
export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n)}%`;
}

/** Formatea fecha/hora ISO para lectura humana estable en español; '—' si no hay dato válido. */
/**
 * Tiempo transcurrido en lenguaje llano: "ahora mismo", "hace 5 min", "hace 3 h", "hace 2 días".
 * `now` es inyectable para tests.
 */
export function fmtAgo(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '—';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '—';
  const min = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Clave de semana ISO ("YYYY-Www") de una fecha, igual que el cálculo del
 * backend (`weekKeyOf` en apps/api), para que las gráficas semanales del
 * cliente usen las mismas etiquetas.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lunes=0 .. domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jueves de esta semana ISO
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export interface WeeklyCountEntry {
  week: string;
  count: number;
}

/**
 * Agrupa un array de fechas (ISO string o `Date`, admite `null`/`undefined`)
 * por semana ISO y cuenta ocurrencias; devuelve las últimas `limit` semanas
 * ordenadas cronológicamente. Función pura, usada para las gráficas
 * semanales calculadas en el cliente (Entrega, Iniciativa).
 */
export function weeklyCounts(
  dates: Array<string | Date | null | undefined>,
  limit = 8,
): WeeklyCountEntry[] {
  const acc = new Map<string, number>();
  for (const raw of dates) {
    if (!raw) continue;
    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.getTime())) continue;
    const w = isoWeekKey(date);
    acc.set(w, (acc.get(w) ?? 0) + 1);
  }
  const sorted = [...acc.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return sorted.slice(-limit).map(([week, count]) => ({ week, count }));
}
