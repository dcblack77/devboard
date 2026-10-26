/**
 * Métricas puras de la vista "Sistema": DORA por repo, práctica de PRs por
 * periodo, ciclo Kanban + flow efficiency y lotes de cierre. Sin acceso a BD:
 * reciben entradas tipadas ya cargadas (o derivadas de `analyzeIssues`).
 */
import { hours } from './time.js';

export interface Window {
  from: Date;
  to: Date;
}

export interface SystemRun {
  id: number;
  repo: string;
  name: string | null;
  headBranch: string | null;
  conclusion: string | null;
  createdAt: Date;
}

export interface SystemReview {
  author: string;
  isBot: boolean;
  state: string;
  submittedAt: Date | null;
}

export interface SystemPr {
  id: string;
  repo: string;
  author: string | null;
  isBot: boolean;
  baseRef: string | null;
  firstCommitAt: Date | null;
  createdAt: Date;
  mergedAt: Date | null;
  additions: number;
  deletions: number;
  reviews: SystemReview[];
}

export interface SystemSegment {
  status: string;
  startedAt: Date;
  endedAt: Date;
}

/** Issue ya analizado (ver `analyzeIssues`): tramos cerrados + `deliveredAt`. */
export interface SystemIssue {
  key: string;
  createdAt: Date;
  resolvedAt: Date | null;
  deliveredAt: Date | null;
  segments: SystemSegment[];
}

export interface SystemSettings {
  deployWorkflow: string;
  deployBranches: string;
  featureBase: string;
}

export interface DoraRepo {
  repo: string;
  deploys: number;
  deploysPerWeek: number;
  cfr: number | null;
  hotfixPct: number | null;
  leadTimeH: { p50: number | null; p85: number | null };
  codingH: number | null;
  pickupH: number | null;
  reviewH: number | null;
  mergeToProdH: number | null;
  recoveryH: number | null;
}

const HOTFIX_RE = /hotfix|revert/i;

/** Cuantil lineal (q∈[0,1]) o null si no hay valores. */
export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function inWindow(d: Date | null, w: Window): d is Date {
  return d !== null && d >= w.from && d <= w.to;
}

function pct(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

function firstHumanReview(pr: SystemPr): Date | null {
  const ts = pr.reviews
    .filter((r) => !r.isBot && r.submittedAt && r.author !== pr.author)
    .map((r) => r.submittedAt as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  return ts[0] ?? null;
}

/** DORA por repositorio: despliegues = runs `deployWorkflow` en ramas `deployBranches`. */
export function doraPerRepo(prs: SystemPr[], runs: SystemRun[], settings: SystemSettings, window: Window): DoraRepo[] {
  const branchRe = new RegExp(settings.deployBranches);
  const weeks = Math.max(hours(window.from, window.to) / (24 * 7), 1e-9);
  const repos = new Set<string>([...runs.map((r) => r.repo), ...prs.map((p) => p.repo)]);
  const out: DoraRepo[] = [];
  for (const repo of [...repos].sort()) {
    const deployRuns = runs
      .filter(
        (r) =>
          r.repo === repo &&
          r.name === settings.deployWorkflow &&
          branchRe.test(r.headBranch ?? '') &&
          inWindow(r.createdAt, window),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const success = deployRuns.filter((r) => r.conclusion === 'success');
    const failures = deployRuns.filter((r) => r.conclusion === 'failure');
    const recovery: number[] = [];
    for (const f of failures) {
      const next = success.find((s) => s.createdAt >= f.createdAt);
      if (next) recovery.push(hours(f.createdAt, next.createdAt));
    }
    const lead: number[] = [];
    const coding: number[] = [];
    const pickup: number[] = [];
    const review: number[] = [];
    const toProd: number[] = [];
    for (const pr of prs) {
      if (pr.repo !== repo || pr.isBot || !inWindow(pr.mergedAt, window)) continue;
      const merged = pr.mergedAt;
      // Cohorte única: solo PRs que ya llegaron a producción (mismo criterio que el lead time).
      const deploy = success.find((s) => s.createdAt >= merged);
      if (!deploy) continue;
      const fr = firstHumanReview(pr);
      if (pr.firstCommitAt) coding.push(hours(pr.firstCommitAt, pr.createdAt));
      if (fr) {
        pickup.push(hours(pr.createdAt, fr));
        review.push(hours(fr, merged));
      }
      toProd.push(hours(merged, deploy.createdAt));
      if (pr.firstCommitAt) lead.push(hours(pr.firstCommitAt, deploy.createdAt));
    }
    out.push({
      repo,
      deploys: success.length,
      deploysPerWeek: success.length / weeks,
      cfr: pct(failures.length, deployRuns.length),
      hotfixPct: pct(success.filter((r) => HOTFIX_RE.test(r.headBranch ?? '')).length, success.length),
      leadTimeH: { p50: quantile(lead, 0.5), p85: quantile(lead, 0.85) },
      codingH: quantile(coding, 0.5),
      pickupH: quantile(pickup, 0.5),
      reviewH: quantile(review, 0.5),
      mergeToProdH: quantile(toProd, 0.5),
      recoveryH: quantile(recovery, 0.5),
    });
  }
  return out;
}

export interface PracticePeriod {
  period: string;
  prs: number;
  sizeP50: number | null;
  pctOver400: number | null;
  pickupP50H: number | null;
  firstReviewToMergeP50H: number | null;
  humanReviewsPerPr: number | null;
  pctMergedWithoutHumanApproval: number | null;
}

function quarterKey(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isFeaturePr(pr: SystemPr, settings: SystemSettings, window: Window): pr is SystemPr & { mergedAt: Date } {
  if (pr.isBot || !inWindow(pr.mergedAt, window)) return false;
  return pr.baseRef === null || pr.baseRef === settings.featureBase;
}

function practiceFor(period: string, prs: (SystemPr & { mergedAt: Date })[]): PracticePeriod {
  const sizes = prs.map((p) => p.additions + p.deletions);
  const pickup: number[] = [];
  const toMerge: number[] = [];
  let humanReviews = 0;
  let noApproval = 0;
  for (const p of prs) {
    const humans = p.reviews.filter((r) => !r.isBot && r.author !== p.author);
    humanReviews += humans.length;
    if (!humans.some((r) => r.state === 'APPROVED')) noApproval += 1;
    const fr = firstHumanReview(p);
    if (fr) {
      pickup.push(hours(p.createdAt, fr));
      toMerge.push(hours(fr, p.mergedAt));
    }
  }
  return {
    period,
    prs: prs.length,
    sizeP50: quantile(sizes, 0.5),
    pctOver400: pct(sizes.filter((s) => s > 400).length, prs.length),
    pickupP50H: quantile(pickup, 0.5),
    firstReviewToMergeP50H: quantile(toMerge, 0.5),
    humanReviewsPerPr: prs.length === 0 ? null : humanReviews / prs.length,
    pctMergedWithoutHumanApproval: pct(noApproval, prs.length),
  };
}

function groupBy(prs: (SystemPr & { mergedAt: Date })[], keyOf: (d: Date) => string): PracticePeriod[] {
  const groups = new Map<string, (SystemPr & { mergedAt: Date })[]>();
  for (const p of prs) {
    const k = keyOf(p.mergedAt);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.keys()].sort().map((k) => practiceFor(k, groups.get(k) as (SystemPr & { mergedAt: Date })[]));
}

/** Práctica de PRs (feature PRs mergeados, no bot) agrupada por trimestre y por mes. */
export function prPractice(
  prs: SystemPr[],
  settings: SystemSettings,
  window: Window,
): { byQuarter: PracticePeriod[]; byMonth: PracticePeriod[] } {
  const feature = prs.filter((p) => isFeaturePr(p, settings, window));
  return { byQuarter: groupBy(feature, quarterKey), byMonth: groupBy(feature, monthKey) };
}

/** Nombres de estado normalizados de la vista Kanban (mismos que `statusFlow` de Jira). */
export const KANBAN_STATUSES = {
  inProgress: 'En curso',
  inReview: 'In review',
  blocked: 'Blocked',
  deployedDev: 'Desplegado en DEV',
  qaBusiness: 'QA Negocio',
} as const;

export interface KanbanStateStat {
  status: string;
  p50H: number | null;
  pctOfTickets: number | null;
}

export interface KanbanFlow {
  tickets: number;
  cycleKanbanH: number | null;
  engineeringH: number | null;
  waitingH: number | null;
  flowEfficiency: number | null;
  states: KanbanStateStat[];
  reworkPct: number | null;
  /** % resueltos antes de `deliveredAt` (no hay enlace PR→issue en la entrada). */
  closedBeforeDeliveredPct: number | null;
}

function sumIn(segments: SystemSegment[], statuses: readonly string[]): number {
  return segments.filter((s) => statuses.includes(s.status)).reduce((acc, s) => acc + hours(s.startedAt, s.endedAt), 0);
}

/** Ciclo Kanban + flow efficiency sobre issues resueltos en la ventana. */
export function kanbanCycle(issues: SystemIssue[], window: Window): KanbanFlow {
  const K = KANBAN_STATUSES;
  const engStatuses = [K.inProgress, K.inReview];
  const waitStatuses = [K.blocked, K.deployedDev, K.qaBusiness];
  const resolved = issues.filter((i) => inWindow(i.resolvedAt, window)) as (SystemIssue & { resolvedAt: Date })[];
  const cycle: number[] = [];
  const eng: number[] = [];
  const wait: number[] = [];
  let rework = 0;
  let closedBefore = 0;
  const perState = new Map<string, number[]>();
  for (const i of resolved) {
    const start = i.segments.find((s) => s.status === K.inProgress);
    const end = i.deliveredAt ?? i.resolvedAt;
    if (start) cycle.push(hours(start.startedAt, end));
    const e = sumIn(i.segments, engStatuses);
    const w = sumIn(i.segments, waitStatuses);
    eng.push(e);
    wait.push(w);
    if (i.segments.filter((s) => s.status === K.inProgress).length >= 2) rework += 1;
    if (i.deliveredAt && i.resolvedAt < i.deliveredAt) closedBefore += 1;
    const byStatus = new Map<string, number>();
    for (const s of i.segments) byStatus.set(s.status, (byStatus.get(s.status) ?? 0) + hours(s.startedAt, s.endedAt));
    for (const [st, h] of byStatus) perState.set(st, [...(perState.get(st) ?? []), h]);
  }
  const engTotal = eng.reduce((a, b) => a + b, 0);
  const waitTotal = wait.reduce((a, b) => a + b, 0);
  const n = resolved.length;
  return {
    tickets: n,
    cycleKanbanH: quantile(cycle, 0.5),
    engineeringH: quantile(eng, 0.5),
    waitingH: quantile(wait, 0.5),
    flowEfficiency: engTotal + waitTotal === 0 ? null : engTotal / (engTotal + waitTotal),
    states: [...perState.keys()].sort().map((status) => {
      const hs = perState.get(status) as number[];
      return { status, p50H: quantile(hs, 0.5), pctOfTickets: pct(hs.length, n) };
    }),
    reworkPct: pct(rework, n),
    closedBeforeDeliveredPct: pct(closedBefore, n),
  };
}
