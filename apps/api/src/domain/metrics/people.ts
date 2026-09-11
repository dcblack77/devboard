/**
 * Métricas por persona (`dev_stats` en el Python de referencia): resumen de
 * carga, throughput, ciclo/lead, épicas en las que participa y foco de
 * atención, para cada assignee (o "(sin asignar)").
 */
import { MacroStatus } from '@devboard/shared';
import type { EpicWithChildren } from '../../integrations/jira/types.js';
import { mean, slugify, weekKey } from './time.js';
import { daysByStateType, type DaysByStateType } from './status.js';
import type { AnalyzedIssue, IssueMetricsSettings } from './issues.js';

const UNASSIGNED = '(sin asignar)';

function macroOf(status: string, settings: IssueMetricsSettings): MacroStatus | string {
  return settings.macroMap[status] ?? MacroStatus.Pending;
}

export interface EpicSummaryForDev {
  key: string;
  summary: string;
  status: string;
  childrenTotal: number;
  childrenByMacro: Record<string, number>;
  pctDone: number;
  mine: Array<{ key: string; type: string; status: string; summary: string }>;
}

export interface WeeklyCount {
  week: string;
  completedByType: Record<string, number>;
  completed: number;
}

export interface AttentionIssue extends AnalyzedIssue {
  why: string[];
}

export interface DevStat {
  dev: string;
  slug: string;
  total: number;
  open: number;
  done: number;
  wipCounted: number;
  active: number;
  blockedNow: number;
  throughput4w: number;
  throughputWindow: number;
  cycleMean: number | null;
  cycleMax: number | null;
  cycleN: number;
  leadMean: number | null;
  openAgeMax: number | null;
  blocked: number;
  byStatus: Record<string, number>;
  byStatusType: Record<string, Record<string, number>>;
  byType: Record<string, number>;
  daysByStateType: DaysByStateType;
  weekly: WeeklyCount[];
  wip: AnalyzedIssue[];
  attention: AttentionIssue[];
  epics: EpicSummaryForDev[];
  issues: AnalyzedIssue[];
}

function macroCountForEpicChildren(
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

function pctDoneFromMacroCount(byMacro: Record<string, number>): number {
  const total = Object.values(byMacro).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const done = (byMacro[MacroStatus.Closed] ?? 0) + (byMacro[MacroStatus.Delivered] ?? 0);
  return Math.round((100 * done) / total);
}

/**
 * Estadísticas por persona. `epicIndex` = `{epicKey: EpicWithChildren}`,
 * TODOS los hijos de cada épica (sin filtrar por ventana temporal), para
 * calcular `pctDone` real de las épicas en las que participa cada dev.
 */
export function devStats(
  rows: AnalyzedIssue[],
  epicIndex: Record<string, EpicWithChildren>,
  settings: IssueMetricsSettings,
  now: Date,
  weeks: string[],
): DevStat[] {
  const devs = new Map<string, AnalyzedIssue[]>();
  for (const r of rows) {
    if (r.type === 'Epic') continue;
    const dev = r.assigneeRaw ?? UNASSIGNED;
    const list = devs.get(dev) ?? [];
    list.push(r);
    devs.set(dev, list);
  }

  const cutoff4w = new Date(now.getTime() - 4 * 7 * 86_400_000);
  const flow = settings.statusFlow;

  const out: DevStat[] = [];
  for (const [dev, rs] of devs.entries()) {
    const open = rs.filter((r) => !r.done);
    const countedDone = rs.filter((r) => r.counted && r.deliveredAt);

    const cycles = countedDone.map((r) => r.cycleHours).filter((h): h is number => h !== null);

    const byStatusType: Record<string, Record<string, number>> = {};
    for (const r of rs) {
      const byType = byStatusType[r.status] ?? {};
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      byStatusType[r.status] = byType;
    }

    const weekly = new Map<string, Record<string, number>>(weeks.map((w) => [w, {}]));
    for (const r of countedDone) {
      const w = r.deliveredAt ? weekKey(r.deliveredAt) : null;
      if (w && weekly.has(w)) {
        const byType = weekly.get(w)!;
        byType[r.type] = (byType[r.type] ?? 0) + 1;
      }
    }

    const epics: EpicSummaryForDev[] = [];
    for (const e of Object.values(epicIndex)) {
      const mine = e.children.filter((c) => (c.assigneeRaw ?? UNASSIGNED) === dev);
      if (mine.length === 0) continue;
      const byMacro = macroCountForEpicChildren(e.children, settings);
      const total = Object.values(byMacro).reduce((a, b) => a + b, 0);
      epics.push({
        key: e.key,
        summary: e.summary,
        status: e.status,
        childrenTotal: total,
        childrenByMacro: byMacro,
        pctDone: pctDoneFromMacroCount(byMacro),
        mine: mine.map((c) => ({ key: c.key, type: c.type, status: c.status, summary: c.summary })),
      });
    }
    epics.sort((a, b) => b.mine.length - a.mine.length);

    const attention: AttentionIssue[] = open
      .map((r) => ({ ...r, why: r.attention }))
      .filter((a) => a.why.length > 0)
      .sort((a, b) => b.inStatusHours - a.inStatusHours);

    const wip = [...open].sort((a, b) => {
      const ia = flow.indexOf(a.status);
      const ib = flow.indexOf(b.status);
      const oa = ia === -1 ? 99 : ia;
      const ob = ib === -1 ? 99 : ib;
      if (oa !== ob) return oa - ob;
      return b.inStatusHours - a.inStatusHours;
    });

    const byStatus: Record<string, number> = {};
    for (const [status, byType] of Object.entries(byStatusType)) {
      byStatus[status] = Object.values(byType).reduce((a, b) => a + b, 0);
    }

    const byType: Record<string, number> = {};
    for (const r of rs) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
    }

    out.push({
      dev,
      slug: slugify(dev),
      total: rs.length,
      open: open.length,
      done: rs.length - open.length,
      wipCounted: open.filter(
        (r) => r.counted && r.status !== flow[0] && !(flow.length > 1 && r.status === flow[1]),
      ).length,
      active: open.filter((r) => r.macro === MacroStatus.InProgress).length,
      blockedNow: open.filter((r) => r.macro === MacroStatus.Blocked).length,
      throughput4w: countedDone.filter((r) => r.deliveredAt && r.deliveredAt >= cutoff4w).length,
      throughputWindow: countedDone.length,
      cycleMean: mean(cycles),
      cycleMax: cycles.length ? Math.max(...cycles) : null,
      cycleN: cycles.length,
      leadMean: mean(countedDone.map((r) => r.leadHours).filter((h): h is number => h !== null)),
      openAgeMax: open.length ? Math.max(...open.map((r) => r.inStatusHours)) : null,
      blocked: rs.reduce((acc, r) => acc + r.blockedVisits, 0),
      byStatus,
      byStatusType,
      byType,
      daysByStateType: daysByStateType(rs),
      weekly: weeks.map((w) => {
        const byType = weekly.get(w) ?? {};
        return { week: w, completedByType: byType, completed: Object.values(byType).reduce((a, b) => a + b, 0) };
      }),
      wip,
      attention,
      epics,
      issues: [...rs].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.inStatusHours - a.inStatusHours;
      }),
    });
  }

  out.sort((a, b) => {
    const aUnassigned = a.dev === UNASSIGNED ? 1 : 0;
    const bUnassigned = b.dev === UNASSIGNED ? 1 : 0;
    if (aUnassigned !== bUnassigned) return aUnassigned - bUnassigned;
    return b.total - a.total;
  });

  return out;
}
