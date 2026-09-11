/**
 * Números de negocio de portada (`team_numbers` + `home` del board Python de
 * referencia, sin HTML: solo el cálculo). Cuatro bloques: Compromiso
 * (iniciativas en verde/ámbar/rojo vía RAG), Entrega (throughput y ciclo),
 * Riesgo (bloqueadas, paradas, PRs esperando review) y Calidad (errores vs
 * funcionalidad, hotfix, PRs sin aprobación).
 */
import { MacroStatus } from '@devboard/shared';
import { mean } from './time.js';
import type { AnalyzedIssue, IssueMetricsSettings } from './issues.js';
import type { DevStat } from './people.js';
import { UNASSIGNED } from './people.js';
import type { InitiativeStat, RagColor } from './initiatives.js';
import { ragInitiative } from './initiatives.js';
import type { ReviewStats } from './github.js';

function macroOf(status: string, settings: IssueMetricsSettings): MacroStatus | string {
  return settings.macroMap[status] ?? MacroStatus.Pending;
}

export interface TeamNumbersInitiative {
  name: string;
  slug: string;
  pct: number;
  byMacro: Record<string, number>;
  total: number;
  blocked: number;
  throughput4w: number;
  epicsCount: number;
}

export interface TeamNumbersGithub {
  open: number;
  waiting: number;
  firstReview: number | null;
  toMerge: number | null;
  merged4w: number;
  noApproval: number;
  pctNoApproval: number;
  hotfix4w: number;
  hotfix: number;
  merged: number;
}

export interface TeamNumbers {
  lastWeek: number;
  avg4: number | null;
  weekLabels: string[];
  weekTotals: number[];
  open: number;
  blocked: number;
  blocked5d: number;
  aged: number;
  attention: number;
  delivered: number;
  delivered4w: number;
  bugs4w: number;
  feat4w: number;
  bugsTotal: number;
  cycleMean: number | null;
  cycleMax: number | null;
  byStatus: Record<string, number>;
  initiatives: TeamNumbersInitiative[];
  github: TeamNumbersGithub | null;
  people: number;
}

/** Subconjunto mínimo de `MetricsContext` que necesita este módulo. */
export interface HomeContext {
  now: Date;
  settings: IssueMetricsSettings;
  initiativesList: InitiativeStat[];
  gh: ReviewStats | null;
}

/**
 * Cifras de portada del equipo. Puerto 1:1 de `team_numbers()` de
 * `render_v4.py`, sin generar HTML.
 */
export function teamNumbers(rows: AnalyzedIssue[], dstats: DevStat[], ctx: HomeContext): TeamNumbers {
  const { now, settings, initiativesList, gh } = ctx;
  const work = rows.filter((r) => r.type !== 'Epic');
  const counted = work.filter((r) => r.counted);
  const team = dstats.filter((d) => d.dev !== UNASSIGNED);
  const weeks = team[0]?.weekly ?? [];
  const weekTotals = weeks.map((_, i) => team.reduce((acc, d) => acc + (d.weekly[i]?.completed ?? 0), 0));
  const lastWeek = weekTotals.length ? weekTotals[weekTotals.length - 1]! : 0;
  const prev4 = weekTotals.length >= 5 ? weekTotals.slice(-5, -1) : weekTotals.slice(0, -1);
  const avg4 = prev4.length ? mean(prev4) : null;

  const open = work.filter((r) => !r.done && r.assigneeRaw !== null);
  const blocked = open.filter((r) => r.macro === MacroStatus.Blocked);
  const blocked5d = blocked.filter((r) => r.inStatusHours > 24 * 5);
  const backlogStatus = settings.statusFlow[0] ?? null;
  const todoStatus = settings.statusFlow[1] ?? null;
  const aged = open.filter(
    (r) => r.status !== backlogStatus && r.status !== todoStatus && r.inStatusHours > 24 * settings.attentionDays,
  );
  const attention = team.reduce((acc, d) => acc + d.attention.length, 0);

  const delivered = counted.filter((r) => r.deliveredAt);
  const cutoff4w = new Date(now.getTime() - 4 * 7 * 86_400_000);
  const d4 = delivered.filter((r) => r.deliveredAt && r.deliveredAt >= cutoff4w);
  const bugs4 = d4.filter((r) => r.type === 'Error').length;
  const feat4 = d4.length - bugs4;
  const cyc = delivered.map((r) => r.cycleHours).filter((h): h is number => h !== null);

  const byStatus: Record<string, number> = {};
  for (const s of settings.statusFlow) {
    if (macroOf(s, settings) === MacroStatus.Closed) continue;
    byStatus[s] = open.filter((r) => r.status === s).length;
  }

  const initiatives: TeamNumbersInitiative[] = initiativesList.map((i) => ({
    name: i.name,
    slug: i.slug,
    pct: i.pctDone,
    byMacro: i.childrenByMacro,
    total: i.childrenTotal,
    blocked: i.childrenByMacro[MacroStatus.Blocked] ?? 0,
    throughput4w: i.throughput4w,
    epicsCount: i.epics.length,
  }));

  const github: TeamNumbersGithub | null = gh
    ? {
        open: gh.open,
        waiting: gh.waiting.length,
        firstReview: gh.hFirstReviewMean,
        toMerge: gh.hToMergeMean,
        merged4w: gh.merged4w,
        noApproval: gh.mergedNoApproval,
        pctNoApproval: gh.pctMergedNoApproval,
        hotfix4w: gh.hotfix4w,
        hotfix: gh.hotfix,
        merged: gh.merged,
      }
    : null;

  return {
    lastWeek,
    avg4,
    weekLabels: weeks.map((w) => w.week),
    weekTotals,
    open: open.length,
    blocked: blocked.length,
    blocked5d: blocked5d.length,
    aged: aged.length,
    attention,
    delivered: delivered.length,
    delivered4w: d4.length,
    bugs4w: bugs4,
    feat4w: feat4,
    bugsTotal: delivered.filter((r) => r.type === 'Error').length,
    cycleMean: mean(cyc),
    cycleMax: cyc.length ? Math.max(...cyc) : null,
    byStatus,
    initiatives,
    github,
    people: team.length,
  };
}

export interface HomeRagEntry {
  name: string;
  slug: string;
  pct: number;
  color: RagColor;
  reason: string;
}

export interface HomeTrend {
  diff: number;
  avg4: number;
  positive: boolean;
}

export interface HomeSummary {
  numbers: TeamNumbers;
  trend: HomeTrend | null;
  rag: HomeRagEntry[];
  ragCounts: { green: number; amber: number; red: number };
}

/**
 * Resumen de portada (`/api/home`): las cuatro preguntas (Compromiso,
 * Entrega, Riesgo, Calidad) como datos estructurados. Puerto de `home()` de
 * `render_v4.py` sin el HTML.
 */
export function homeSummary(rows: AnalyzedIssue[], dstats: DevStat[], ctx: HomeContext): HomeSummary {
  const numbers = teamNumbers(rows, dstats, ctx);

  let trend: HomeTrend | null = null;
  if (numbers.avg4 !== null) {
    const diff = numbers.lastWeek - numbers.avg4;
    trend = { diff, avg4: numbers.avg4, positive: diff >= 0 };
  }

  const rag: HomeRagEntry[] = ctx.initiativesList.map((i) => {
    const r = ragInitiative(i);
    return { name: i.name, slug: i.slug, pct: i.pctDone, color: r.color, reason: r.reason };
  });
  const ragCounts = {
    red: rag.filter((r) => r.color === 'r').length,
    amber: rag.filter((r) => r.color === 'a').length,
    green: rag.filter((r) => r.color === 'g').length,
  };

  return { numbers, trend, rag, ragCounts: { green: ragCounts.green, amber: ragCounts.amber, red: ragCounts.red } };
}
