/**
 * Helpers de tiempo/estadística puros usados por las métricas de dominio.
 * Puerto 1:1 de las utilidades del board Python de referencia (`hours`,
 * `days_`, `mean`, `week_key`, `week_labels`, `slugify`).
 */

/** Número de semanas por defecto que cubren los históricos semanales (`WEEKS` en Python). */
export const DEFAULT_WEEKS = 13;

/** Diferencia entre dos fechas en horas. */
export function hours(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000;
}

/** Horas → días con un decimal, o `null` si la entrada es `null`. */
export function days(h: number | null | undefined): number | null {
  if (h === null || h === undefined) return null;
  return Math.round((h / 24) * 10) / 10;
}

/** Media aritmética, o `null` si el array está vacío. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

/** Horas → texto en días para mensajes de atención (p.ej. "3.5 días", "<1 día"). */
export function formatDays(h: number | null | undefined): string {
  if (h === null || h === undefined) return '–';
  const d = h / 24;
  if (d < 1) return '<1 día';
  if (d < 10) {
    const rounded = Math.round(d * 10) / 10;
    return rounded === 1 ? '1 día' : `${rounded.toFixed(1)} días`;
  }
  return `${Math.round(d)} días`;
}

/** Clave de semana ISO (`YYYY-Www`) de una fecha, con semanas de lunes a domingo. */
export function weekKey(date: Date): string {
  // Algoritmo ISO 8601: jueves de la semana define el año ISO.
  // Se opera enteramente en UTC para no depender de la zona horaria del host.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lunes=0 ... domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jueves de esta semana
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Lunes (00:00:00.000 UTC) de la semana que contiene `date`, para trabajar en un huso consistente. */
function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lunes=0
  d.setUTCDate(d.getUTCDate() - dayNum);
  return d;
}

/**
 * Lista ordenada (más antigua → más reciente) de claves de semana desde
 * `now` hacia atrás. Cubre al menos `DEFAULT_WEEKS` semanas; si se pasa
 * `since`, se extiende para cubrir todo el rango desde esa fecha.
 */
export function weekLabels(now: Date, since?: Date | null): string[] {
  const monday = mondayOf(now);
  let n = DEFAULT_WEEKS;
  if (since) {
    const diffDays = Math.floor((monday.getTime() - since.getTime()) / 86_400_000);
    n = Math.max(DEFAULT_WEEKS, Math.floor(diffDays / 7) + 1);
  }
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(monday.getTime() - i * 7 * 86_400_000);
    out.push(weekKey(d));
  }
  return out;
}

/** Convierte un texto libre en un slug ascii-lower-kebab (fallback `"x"` si queda vacío). */
export function slugify(s: string): string {
  const normalized = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, ''); // quita diacríticos
  const slug = normalized
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'x';
}
