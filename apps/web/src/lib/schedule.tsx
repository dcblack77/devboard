/**
 * Helpers de UI para plazos (fechas de Jira) y estimación. Compartidos por Corporativo,
 * Iniciativas e Iniciativa. Los valores que faltan (fixtures antiguos) se tratan como null.
 */
export type Schedule = 'on_track' | 'at_risk' | 'overdue' | 'no_dates' | 'closed';

export interface Estimation {
  pointsOpen: number;
  withPoints: number;
  withDueOnly: number;
  unestimated: number;
  open: number;
}

/** Campos de plazo que la API añade a iniciativas, épicas y entradas de Corporativo. */
export interface DateFields {
  startDate?: string | null;
  targetDate?: string | null;
  closedAt?: string | null;
  schedule?: Schedule;
  closedLate?: boolean;
  daysLeft?: number | null;
  jiraKey?: string | null;
  jiraUrl?: string | null;
  estimation?: Estimation;
}

/** `2026-01-01` → `01/01/26` (desde las partes del texto, sin zona horaria). */
export function fmtDateShort(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${d}/${m}/${(y ?? '').slice(2)}`;
}

/** `2026-03-25` → `25/03`. */
export function fmtDayMonth(date: string): string {
  const [, m, d] = date.slice(0, 10).split('-');
  return `${d}/${m}`;
}

const MISSING_TIP = 'Falta en Jira';

export function MissingDate() {
  return (
    <span className="muted" title={MISSING_TIP}>
      —
    </span>
  );
}

/** Fecha corta o «—» con tooltip. */
export function DateCell({ date }: { date: string | null | undefined }) {
  return date ? <>{fmtDateShort(date)}</> : <MissingDate />;
}

const SCHEDULE_PILL: Record<Schedule, { cls: string; label: string }> = {
  on_track: { cls: 'st-ok', label: 'En plazo' },
  at_risk: { cls: 'st-amber', label: 'En riesgo' },
  overdue: { cls: 'st-warn', label: 'Vencida' },
  no_dates: { cls: 'st-muted', label: 'Sin fecha' },
  closed: { cls: 'st-other', label: 'Cerrada' },
};

export function SchedulePill({ schedule, closedLate }: { schedule?: Schedule; closedLate?: boolean }) {
  const p = schedule ? SCHEDULE_PILL[schedule] : undefined;
  if (!p) return <span className="muted">—</span>;
  return (
    <span className={`st-pill ${p.cls}`}>
      {p.label}
      {schedule === 'closed' && closedLate ? <span className="sched-late">tarde</span> : null}
    </span>
  );
}

/** «en 30 d» / «hace 11 d» / «hoy». */
export function daysLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'hoy';
  return daysLeft > 0 ? `en ${daysLeft} d` : `hace ${-daysLeft} d`;
}

export function TargetDate({ date, daysLeft }: { date?: string | null; daysLeft?: number | null }) {
  if (!date) return <MissingDate />;
  return (
    <>
      {fmtDateShort(date)}
      {daysLeft !== null && daysLeft !== undefined ? <small className="muted sched-days">{daysLabel(daysLeft)}</small> : null}
    </>
  );
}

export function EstimationCell({ e }: { e?: Estimation }) {
  if (!e) return <span className="muted">—</span>;
  return (
    <>
      {e.pointsOpen} d estimados
      {e.unestimated > 0 ? <span className="badge badge-amber sched-badge">{e.unestimated} sin estimar</span> : null}
    </>
  );
}

export function JiraKeyLink({ jiraKey, jiraUrl }: { jiraKey?: string | null; jiraUrl?: string | null }) {
  if (!jiraKey) return <span className="muted">—</span>;
  if (!jiraUrl) return <>{jiraKey}</>;
  return (
    <a href={jiraUrl} target="_blank" rel="noopener noreferrer">
      {jiraKey}
    </a>
  );
}

/** Orden por fin estimado ascendente, sin fecha al final; estable. */
export function sortByTarget<T extends { targetDate?: string | null }>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = a.r.targetDate ?? null;
      const y = b.r.targetDate ?? null;
      if (x === y) return a.i - b.i;
      if (x === null) return 1;
      if (y === null) return -1;
      return x < y ? -1 : 1;
    })
    .map((o) => o.r);
}
