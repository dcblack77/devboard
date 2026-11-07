/**
 * Plazos de iniciativas/épicas: estado de calendario y estimación.
 * Funciones puras; "hoy" = fecha de calendario UTC de `now`. Fechas de Jira como `YYYY-MM-DD`.
 */
export const AT_RISK_GAP_POINTS = 40;

export type ScheduleStatus = 'closed' | 'no_dates' | 'overdue' | 'at_risk' | 'on_track';

export interface ScheduleInput {
  startDate: string | null;
  targetDate: string | null;
  closed: boolean;
  progressPct: number;
}
export interface Estimation {
  pointsOpen: number;
  withPoints: number;
  withDueOnly: number;
  unestimated: number;
  open: number;
}
export interface EstimableChild {
  done: boolean;
  storyPoints?: number | null;
  dueDate?: string | null;
}
export interface EpicDatesInput {
  startDate: string | null;
  targetDate: string | null;
  done: boolean;
  resolvedAt: Date | null;
}
export interface AggregatedDates {
  startDate: string | null;
  targetDate: string | null;
  closed: boolean;
  closedAt: Date | null;
}

const DAY_MS = 86_400_000;

/** Medianoche UTC (ms) de una fecha `YYYY-MM-DD`. */
function dayMs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}
/** Medianoche UTC (ms) del día UTC de un instante. */
function utcDayMs(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS) * DAY_MS;
}

export function elapsedPct(start: string | null, end: string | null, now: Date): number | null {
  if (!start || !end) return null;
  const s = dayMs(start);
  const e = dayMs(end);
  const t = utcDayMs(now);
  if (t >= e) return 100;
  if (e <= s) return 100;
  return Math.min(100, Math.max(0, ((t - s) / (e - s)) * 100));
}

export function scheduleStatus(i: ScheduleInput, now: Date): ScheduleStatus {
  if (i.closed) return 'closed';
  if (!i.startDate || !i.targetDate) return 'no_dates';
  if (dayMs(i.targetDate) < utcDayMs(now)) return 'overdue';
  const elapsed = elapsedPct(i.startDate, i.targetDate, now) ?? 0;
  if (elapsed - i.progressPct >= AT_RISK_GAP_POINTS) return 'at_risk';
  return 'on_track';
}

export function closedLate(closedAt: Date | null, targetDate: string | null): boolean {
  if (!closedAt || !targetDate) return false;
  return utcDayMs(closedAt) > dayMs(targetDate);
}

export function daysLeft(targetDate: string | null, now: Date): number | null {
  if (!targetDate) return null;
  return Math.round((dayMs(targetDate) - utcDayMs(now)) / DAY_MS);
}

export function aggregateEpicDates(epics: EpicDatesInput[]): AggregatedDates {
  let startDate: string | null = null;
  let targetDate: string | null = null;
  let closedAt: Date | null = null;
  for (const e of epics) {
    if (e.startDate && (!startDate || e.startDate < startDate)) startDate = e.startDate;
    if (e.targetDate && (!targetDate || e.targetDate > targetDate)) targetDate = e.targetDate;
    if (e.resolvedAt && (!closedAt || e.resolvedAt > closedAt)) closedAt = e.resolvedAt;
  }
  const closed = epics.length > 0 && epics.every((e) => e.done);
  return { startDate, targetDate, closed, closedAt: closed ? closedAt : null };
}

export function estimationOf(children: EstimableChild[]): Estimation {
  const est: Estimation = { pointsOpen: 0, withPoints: 0, withDueOnly: 0, unestimated: 0, open: 0 };
  for (const c of children) {
    if (c.done) continue;
    est.open++;
    if (typeof c.storyPoints === 'number' && c.storyPoints > 0) {
      est.withPoints++;
      est.pointsOpen += c.storyPoints;
    } else if (c.dueDate) est.withDueOnly++;
    else est.unestimated++;
  }
  return est;
}
