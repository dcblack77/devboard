/**
 * Métricas por iniciativa (agrupación manual de épicas) y semáforo RAG.
 * Puerto 1:1 de `initiative_stats()`, `_macro_count()`, `_pct_done()` y
 * `rag_initiative()` del board Python de referencia.
 */
import { MacroStatus } from '@devboard/shared';
import type { EpicWithChildren } from '../../integrations/jira/types.js';
import { mean, slugify, weekKey } from './time.js';
import { daysByStateType, type DaysByStateType } from './status.js';
import type { AnalyzedIssue, IssueMetricsSettings } from './issues.js';
import type { AttentionIssue, WeeklyCount } from './people.js';

const UNASSIGNED = '(sin asignar)';

function macroOf(status: string, settings: IssueMetricsSettings): MacroStatus | string {
  return settings.macroMap[status] ?? MacroStatus.Pending;
}

/** Entrada mínima de iniciativa: nombre + claves de las épicas que agrupa. */
export interface InitiativeInput {
  name: string;
  epics: string[];
}

export interface EpicSummaryForInitiative {
  key: string;
  summary: string;
  status: string;
  childrenTotal: number;
  childrenByMacro: Record<string, number>;
  pctDone: number;
}

export interface InitiativePersonStat {
  dev: string;
  total: number;
  open: number;
  done: number;
}

export interface InitiativeStat {
  name: string;
  slug: string;
  epics: EpicSummaryForInitiative[];
  childrenTotal: number;
  childrenByMacro: Record<string, number>;
  pctDone: number;
  inPeriod: number;
  open: number;
  done: number;
  blockedNow: number;
  throughput4w: number;
  cycleMean: number | null;
  cycleMax: number | null;
  byStatusType: Record<string, Record<string, number>>;
  daysByStateType: DaysByStateType;
  weekly: WeeklyCount[];
  people: InitiativePersonStat[];
  attention: AttentionIssue[];
  issues: AnalyzedIssue[];
}

/** `{macro: n}` de los hijos no-subtarea de una épica. */
export function macroCount(
  children: EpicWithChildren['children'],
  settings: IssueMetricsSettings,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of children) {
    if (c.type === 'Subtarea') continue;
    const macro = macroOf(c.status, settings);
    out[macro] = (out[macro] ?? 0) + 1;
  }
  return out;
}

/** Porcentaje (0-100, redondeado) de hijos cerrados o entregados sobre el total no-subtarea. */
export function pctDone(children: EpicWithChildren['children'], settings: IssueMetricsSettings): number {
  const byMacro = macroCount(children, settings);
  const total = Object.values(byMacro).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const done = (byMacro[MacroStatus.Closed] ?? 0) + (byMacro[MacroStatus.Delivered] ?? 0);
  return Math.round((100 * done) / total);
}

/**
 * Estadísticas por iniciativa. `epicIndex` = `{epicKey: EpicWithChildren}`
 * con TODOS los hijos (sin ventana temporal) para el denominador de
 * `pctDone`; `rows` = issues analizados (con ventana) para throughput/RAG.
 */
export function initiativeStats(
  initiatives: InitiativeInput[],
  epicIndex: Record<string, EpicWithChildren>,
  rows: AnalyzedIssue[],
  weeks: string[],
  now: Date,
  settings: IssueMetricsSettings,
): InitiativeStat[] {
  const cutoff4w = new Date(now.getTime() - 4 * 7 * 86_400_000);

  return initiatives.map((initiative) => {
    const epics = initiative.epics.map((k) => epicIndex[k]).filter((e): e is EpicWithChildren => Boolean(e));
    const kidsAll = epics.flatMap((e) => e.children.filter((c) => c.type !== 'Subtarea'));

    const byMacro: Record<string, number> = {};
    for (const c of kidsAll) {
      const macro = macroOf(c.status, settings);
      byMacro[macro] = (byMacro[macro] ?? 0) + 1;
    }
    const total = kidsAll.length;

    const epicKeys = new Set(initiative.epics);
    const storyKeys = new Set(epics.flatMap((e) => e.children.map((c) => c.key)));
    const rs = rows.filter(
      (r) => r.type !== 'Epic' && (r.parentKey !== null && (epicKeys.has(r.parentKey) || storyKeys.has(r.parentKey))),
    );

    const byStatusType: Record<string, Record<string, number>> = {};
    for (const r of rs) {
      const byType = byStatusType[r.status] ?? {};
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      byStatusType[r.status] = byType;
    }

    const countedDone = rs.filter((r) => r.counted && r.deliveredAt);

    const weekly = new Map<string, Record<string, number>>(weeks.map((w) => [w, {}]));
    for (const r of countedDone) {
      const w = r.deliveredAt ? weekKey(r.deliveredAt) : null;
      if (w && weekly.has(w)) {
        const byType = weekly.get(w)!;
        byType[r.type] = (byType[r.type] ?? 0) + 1;
      }
    }

    const people = new Map<string, InitiativePersonStat>();
    for (const c of kidsAll) {
      const dev = c.assigneeRaw ?? UNASSIGNED;
      const p = people.get(dev) ?? { dev, total: 0, open: 0, done: 0 };
      p.total += 1;
      const macro = macroOf(c.status, settings);
      if (macro === MacroStatus.Closed || macro === MacroStatus.Delivered) {
        p.done += 1;
      } else {
        p.open += 1;
      }
      people.set(dev, p);
    }
    people.delete(UNASSIGNED);

    const cycles = countedDone.map((r) => r.cycleHours).filter((h): h is number => h !== null);
    const open = rs.filter((r) => !r.done);
    const attention: AttentionIssue[] = open
      .map((r) => ({ ...r, why: r.attention }))
      .filter((a) => a.why.length > 0)
      .sort((a, b) => b.inStatusHours - a.inStatusHours);

    return {
      name: initiative.name,
      slug: slugify(initiative.name),
      epics: epics.map((e) => ({
        key: e.key,
        summary: e.summary,
        status: e.status,
        childrenTotal: e.children.filter((c) => c.type !== 'Subtarea').length,
        childrenByMacro: macroCount(e.children, settings),
        pctDone: pctDone(e.children, settings),
      })),
      childrenTotal: total,
      childrenByMacro: byMacro,
      pctDone: total
        ? Math.round((100 * ((byMacro[MacroStatus.Closed] ?? 0) + (byMacro[MacroStatus.Delivered] ?? 0))) / total)
        : 0,
      inPeriod: rs.length,
      open: open.length,
      done: rs.length - open.length,
      blockedNow: open.filter((r) => r.status === settings.statusFlow.find((s) => macroOf(s, settings) === MacroStatus.Blocked)).length,
      throughput4w: countedDone.filter((r) => r.deliveredAt && r.deliveredAt >= cutoff4w).length,
      cycleMean: mean(cycles),
      cycleMax: cycles.length ? Math.max(...cycles) : null,
      byStatusType,
      daysByStateType: daysByStateType(rs),
      weekly: weeks.map((w) => {
        const byType = weekly.get(w) ?? {};
        return { week: w, completedByType: byType, completed: Object.values(byType).reduce((a, b) => a + b, 0) };
      }),
      people: [...people.values()].sort((a, b) => b.total - a.total),
      attention,
      issues: [...rs].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.inStatusHours - a.inStatusHours;
      }),
    };
  });
}

export type RagColor = 'r' | 'a' | 'g';

export interface RagResult {
  color: RagColor;
  reason: string;
}

/**
 * Semáforo RAG de una iniciativa (sin fecha objetivo): rojo si hay
 * bloqueadas relevantes o nada entregado en 4 semanas con trabajo en
 * marcha; ámbar si el avance es bajo o no hay actividad; verde si avanza
 * o está completada.
 */
export function ragInitiative(stat: InitiativeStat): RagResult {
  const closed = stat.childrenByMacro[MacroStatus.Closed] ?? 0;
  const delivered = stat.childrenByMacro[MacroStatus.Delivered] ?? 0;
  const openWork = stat.childrenTotal - closed - delivered;
  const active = stat.childrenByMacro[MacroStatus.InProgress] ?? 0;
  const blocked = stat.childrenByMacro[MacroStatus.Blocked] ?? 0;

  if (openWork === 0) return { color: 'g', reason: 'Completada' };
  if (blocked >= 2 || (blocked > 0 && openWork > 0 && blocked / openWork >= 0.3)) {
    return { color: 'r', reason: `${blocked} bloqueadas` };
  }
  if (active > 0 && stat.throughput4w === 0) {
    return { color: 'r', reason: 'En marcha pero sin entregas en 4 semanas' };
  }
  if (blocked > 0 || stat.pctDone < 50) {
    return { color: 'a', reason: blocked > 0 ? '1 bloqueada' : 'Menos de la mitad entregada' };
  }
  if (active === 0 && stat.throughput4w === 0) {
    return { color: 'a', reason: 'Sin actividad (pendientes sin empezar)' };
  }
  return { color: 'g', reason: 'Avanza' };
}
