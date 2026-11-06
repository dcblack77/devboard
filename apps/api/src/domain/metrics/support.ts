/**
 * Métricas puras de la vista "Soporte": volumen, primera acción, resolución, escalado al
 * equipo técnico, reaperturas, antigüedad, desgloses y SLA frente a los objetivos
 * configurados. Sin acceso a BD: recibe los tickets ya cargados. Todas las duraciones en
 * horas naturales (calendario).
 */
import { boardOf, type SupportBoardRowDto, type SupportResponse, type SupportSla, type SupportSummaryDto } from '@devboard/shared';
import { quantile, type Window } from './system.js';
import { hours, weekKey } from './time.js';

export interface SupportStatusChangeInput {
  at: Date;
  from: string | null;
  to: string;
}

export interface SupportTicketInput {
  key: string;
  summary: string;
  type: string;
  status: string;
  priority: string | null;
  labels: string[];
  createdAt: Date;
  resolvedAt: Date | null;
  linkedKeys: string[];
  statusChanges: SupportStatusChangeInput[];
}

export interface SupportInput {
  /** Tablero mostrado (null = varios agregados, `Todos`). */
  project: string | null;
  tickets: SupportTicketInput[];
  /** Claves de los tableros de desarrollo (para "enlazado a desarrollo"). */
  devProjects: string[];
  /** Estado normalizado que significa "escalado al equipo técnico". */
  techStatus: string | null;
  sla: SupportSla;
  /** Alias de estado crudo -> normalizado. */
  aliases: Record<string, string>;
  /** Estado final normalizado (último de `statusFlow`). */
  finalStatus: string;
  now: Date;
}

export const NO_PRIORITY = 'Sin prioridad';

export const SUPPORT_DEFINITIONS: Record<string, string> = {
  hours: 'Todas las duraciones se miden en horas naturales (calendario), incluidas noches y fines de semana.',
  received: 'Tickets creados dentro del periodo (la cohorte).',
  resolved: 'Tickets con fecha de resolución dentro del periodo, se crearan cuando se crearan.',
  openNow: 'Tickets sin resolver ahora mismo, de cualquier antigüedad.',
  firstAction:
    'Primera acción: horas desde la creación hasta el primer cambio de estado real (tras aplicar alias; los cambios a un estado equivalente no cuentan).',
  resolution: 'Resolución: horas desde la creación hasta la fecha de resolución, solo tickets resueltos de la cohorte.',
  escalated: 'Escalado: ticket de la cohorte que pasó alguna vez por el estado configurado como "escalado al equipo técnico".',
  techTime:
    'Tiempo en técnico: suma de todas las estancias de un ticket en el estado de escalado; si sigue ahí, cuenta hasta ahora.',
  reopened: 'Reabierto: ticket de la cohorte con algún cambio que sale del estado final del flujo.',
  linkedToDev: 'Enlazado a desarrollo: ticket de la cohorte con algún enlace a un issue de cualquier tablero de desarrollo.',
  byBoard: 'Por tablero: recibidas, resueltas, abiertas, resolución p50 y % escaladas de cada tablero de soporte en el periodo.',
  slaMet:
    'SLA cumplido: la duración medida es menor o igual que el objetivo de su prioridad. Los tickets sin esa duración (sin acción o sin resolver) no cuentan en el denominador.',
  breachedOpen: 'SLA incumplido abierto: ticket sin resolver cuya antigüedad supera el objetivo de resolución de su prioridad.',
  aging: 'Antigüedad: horas desde la creación hasta ahora de los tickets abiertos.',
};

interface Analyzed {
  t: SupportTicketInput;
  status: string;
  firstActionH: number | null;
  resolutionH: number | null;
  everTech: boolean;
  techH: number | null;
  reopened: boolean;
  linkedToDev: boolean;
  open: boolean;
  ageH: number;
}

function pct(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

function p5085(values: number[]) {
  return { p50: quantile(values, 0.5), p85: quantile(values, 0.85) };
}

function inWindow(d: Date | null, w: Window): d is Date {
  return d !== null && d >= w.from && d <= w.to;
}

function analyze(t: SupportTicketInput, input: SupportInput): Analyzed {
  const norm = (s: string) => input.aliases[s] ?? s;
  const status = norm(t.status);
  const changes = [...t.statusChanges]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((c) => ({ at: c.at, from: c.from === null ? null : norm(c.from), to: norm(c.to) }))
    .filter((c) => c.from !== c.to);

  const firstActionH = changes.length > 0 ? hours(t.createdAt, changes[0].at) : null;
  const resolutionH = t.resolvedAt ? hours(t.createdAt, t.resolvedAt) : null;

  // Tiempo en técnico: recorre el timeline (estado inicial = `from` del primer cambio).
  let techH: number | null = null;
  let everTech = false;
  if (input.techStatus !== null) {
    const tech = input.techStatus;
    let current = changes[0]?.from ?? status;
    let since = t.createdAt;
    let total = 0;
    const visit = (state: string, end: Date) => {
      if (state === tech) {
        everTech = true;
        total += Math.max(0, hours(since, end));
      }
    };
    for (const c of changes) {
      visit(current, c.at);
      current = c.to;
      since = c.at;
    }
    visit(current, t.resolvedAt ?? input.now);
    if (everTech) techH = total;
  }

  return {
    t,
    status,
    firstActionH,
    resolutionH,
    everTech,
    techH,
    reopened: changes.some((c) => c.from === input.finalStatus),
    linkedToDev: t.linkedKeys.some((k) => input.devProjects.includes(boardOf(k))),
    open: t.resolvedAt === null,
    ageH: hours(t.createdAt, input.now),
  };
}

function weekRange(w: Window): string[] {
  const d = new Date(Date.UTC(w.from.getUTCFullYear(), w.from.getUTCMonth(), w.from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const out: string[] = [];
  while (d <= w.to) {
    out.push(weekKey(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

function metRatio(values: (number | null)[], target: number | undefined): { met: number; total: number } | null {
  if (target === undefined) return null;
  const measured = values.filter((v): v is number => v !== null);
  return { met: measured.filter((v) => v <= target).length, total: measured.length };
}

/** Parte del resumen que no depende del selector de tablero (lo rellena el controlador). */
type BoardFields = 'boards' | 'boardNames' | 'selectedBoard' | 'byBoard';

/** Fechas por ticket (todos los del tablero seleccionado) para re-agrupar la gráfica en el cliente. */
export interface SupportTicketDatesDto {
  key: string;
  created: string;
  resolved: string | null;
  priority: string | null;
}

/** Resumen de soporte para la ventana `[from, to]` (cohorte = tickets creados en la ventana). */
export function supportSummary(
  input: SupportInput,
  window: Window,
): Omit<SupportSummaryDto, BoardFields> & { tickets: SupportTicketDatesDto[] } {
  const all = input.tickets.map((t) => analyze(t, input));
  const cohort = all.filter((a) => inWindow(a.t.createdAt, window));
  const openAll = all.filter((a) => a.open).sort((a, b) => b.ageH - a.ageH);
  const tech = input.techStatus;

  // Semanal
  const weeks = weekRange(window);
  const weekly = weeks.map((week) => ({ week, received: 0, resolved: 0 }));
  const idx = new Map(weeks.map((w, i) => [w, i]));
  for (const a of cohort) {
    const i = idx.get(weekKey(a.t.createdAt));
    if (i !== undefined) weekly[i].received += 1;
  }
  const resolvedInWindow = all.filter((a) => inWindow(a.t.resolvedAt, window));
  for (const a of resolvedInWindow) {
    const i = idx.get(weekKey(a.t.resolvedAt as Date));
    if (i !== undefined) weekly[i].resolved += 1;
  }

  // Por prioridad + SLA agregado
  const byPrio = new Map<string, Analyzed[]>();
  for (const a of cohort) {
    const p = a.t.priority ?? NO_PRIORITY;
    byPrio.set(p, [...(byPrio.get(p) ?? []), a]);
  }
  const agg = { fr: { met: 0, total: 0 }, res: { met: 0, total: 0 } };
  const byPriority = [...byPrio.entries()]
    .sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]))
    .map(([priority, xs]) => {
      const target = input.sla[priority];
      const fr = metRatio(
        xs.map((a) => a.firstActionH),
        target?.firstResponseHours,
      );
      const res = metRatio(
        xs.map((a) => a.resolutionH),
        target?.resolutionHours,
      );
      if (fr) {
        agg.fr.met += fr.met;
        agg.fr.total += fr.total;
      }
      if (res) {
        agg.res.met += res.met;
        agg.res.total += res.total;
      }
      return {
        priority,
        count: xs.length,
        resolutionP50H: quantile(
          xs.flatMap((a) => (a.resolutionH === null ? [] : [a.resolutionH])),
          0.5,
        ),
        firstResponseTargetH: target?.firstResponseHours ?? null,
        firstResponseMetPct: fr ? pct(fr.met, fr.total) : null,
        resolutionTargetH: target?.resolutionHours ?? null,
        resolutionMetPct: res ? pct(res.met, res.total) : null,
      };
    });

  const slaConfigured = Object.values(input.sla).some(
    (s) => s.firstResponseHours !== undefined || s.resolutionHours !== undefined,
  );
  const breachedOpen = openAll.flatMap((a) => {
    const targetH = a.t.priority === null ? undefined : input.sla[a.t.priority]?.resolutionHours;
    return targetH !== undefined && a.ageH > targetH
      ? [{ key: a.t.key, summary: a.t.summary, priority: a.t.priority, ageH: a.ageH, targetH }]
      : [];
  });

  // Etiquetas (top 10) y tipos
  const labels = new Map<string, { count: number; openNow: number }>();
  const types = new Map<string, number>();
  for (const a of cohort) {
    for (const l of new Set(a.t.labels)) {
      const e = labels.get(l) ?? { count: 0, openNow: 0 };
      e.count += 1;
      if (a.open) e.openNow += 1;
      labels.set(l, e);
    }
    types.set(a.t.type, (types.get(a.t.type) ?? 0) + 1);
  }
  const byLabel = [...labels.entries()]
    .map(([label, e]) => ({ label, ...e }))
    .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label))
    .slice(0, 10);
  const byType = [...types.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((x, y) => y.count - x.count || x.type.localeCompare(y.type));

  const aging = { lt2d: 0, d2to7: 0, d7to30: 0, gt30d: 0 };
  for (const a of openAll) {
    if (a.ageH < 48) aging.lt2d += 1;
    else if (a.ageH < 24 * 7) aging.d2to7 += 1;
    else if (a.ageH < 24 * 30) aging.d7to30 += 1;
    else aging.gt30d += 1;
  }

  const num = (xs: (number | null)[]) => xs.filter((v): v is number => v !== null);

  return {
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    configured: true,
    project: input.project,
    totals: {
      received: cohort.length,
      resolved: resolvedInWindow.length,
      openNow: openAll.length,
      escalatedPct: tech === null ? null : pct(cohort.filter((a) => a.everTech).length, cohort.length),
      reopenedPct: pct(cohort.filter((a) => a.reopened).length, cohort.length),
      linkedToDevPct:
        input.devProjects.length === 0 ? null : pct(cohort.filter((a) => a.linkedToDev).length, cohort.length),
    },
    times: {
      firstActionH: p5085(num(cohort.map((a) => a.firstActionH))),
      resolutionH: p5085(num(cohort.map((a) => a.resolutionH))),
      techTimeH: p5085(num(cohort.map((a) => a.techH))),
    },
    weekly,
    byPriority,
    byLabel,
    byType,
    sla: {
      configured: slaConfigured,
      firstResponseMetPct: pct(agg.fr.met, agg.fr.total),
      resolutionMetPct: pct(agg.res.met, agg.res.total),
      breachedOpen,
    },
    aging,
    open: openAll.map((a) => ({
      key: a.t.key,
      summary: a.t.summary,
      priority: a.t.priority,
      status: a.status,
      ageH: a.ageH,
      escalated: tech !== null && a.status === tech,
    })),
    definitions: SUPPORT_DEFINITIONS,
    tickets: [...input.tickets]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((t) => ({
        key: t.key,
        created: t.createdAt.toISOString(),
        resolved: t.resolvedAt?.toISOString() ?? null,
        priority: t.priority,
      })),
  };
}

/**
 * Fila "Por tablero" de cada tablero de soporte en la ventana (en el orden de `boards`):
 * recibidas, resueltas, abiertas ahora, resolución p50 y % escaladas de la cohorte.
 */
export function supportByBoard(input: SupportInput, boards: string[], window: Window): SupportBoardRowDto[] {
  const all = input.tickets.map((t) => analyze(t, input));
  return boards.map((board) => {
    const mine = all.filter((a) => boardOf(a.t.key) === board);
    const cohort = mine.filter((a) => inWindow(a.t.createdAt, window));
    return {
      board,
      received: cohort.length,
      resolved: mine.filter((a) => inWindow(a.t.resolvedAt, window)).length,
      openNow: mine.filter((a) => a.open).length,
      resolutionP50H: quantile(
        cohort.flatMap((a) => (a.resolutionH === null ? [] : [a.resolutionH])),
        0.5,
      ),
      escalatedPct: input.techStatus === null ? null : pct(cohort.filter((a) => a.everTech).length, cohort.length),
    };
  });
}

/** Respuesta para un tablero de soporte sin configurar. */
export const SUPPORT_NOT_CONFIGURED: SupportResponse = { configured: false };
