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
  /** Tipo de issue de Jira (`Historia`, `Tarea`, `Error`, `Subtarea`…); null si se desconoce. */
  type: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  deliveredAt: Date | null;
  segments: SystemSegment[];
}

export interface SystemSettings {
  deployWorkflow: string;
  deployBranches: string;
  featureBase: string;
  /** Orden de estados del tablero; ordena la tabla por estado. */
  statusFlow: string[];
  /** Tipos de issue contados en ciclo y cierres (`closed`); vacío = todos. */
  countedTypes: string[];
}

export interface KanbanOptions {
  statusFlow?: string[];
  countedTypes?: string[];
}

/** Filtra a los tipos contados; lista vacía = sin filtro. */
function countedOnly(issues: SystemIssue[], countedTypes: readonly string[] | undefined): SystemIssue[] {
  if (!countedTypes || countedTypes.length === 0) return issues;
  return issues.filter((i) => i.type !== null && countedTypes.includes(i.type));
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
  done: 'Finalizada',
} as const;

export interface KanbanStateStat {
  status: string;
  p50H: number | null;
  pctOfTickets: number | null;
}

export interface KanbanFlow {
  tickets: number;
  cycleKanbanH: number | null;
  cycleKanbanP85H: number | null;
  engineeringH: number | null;
  /** Mediana de espera SOLO sobre tickets que esperaron (>0 h). */
  waitingH: number | null;
  /** % de tickets con alguna espera. */
  pctWithWait: number | null;
  flowEfficiency: number | null;
  /** Por estado visitado, en orden de `statusFlow`; sin el estado terminal. */
  states: KanbanStateStat[];
  reworkPct: number | null;
  /** % resueltos antes de `deliveredAt` (no hay enlace PR→issue en la entrada). */
  closedBeforeDeliveredPct: number | null;
}

function sumIn(segments: SystemSegment[], statuses: readonly string[]): number {
  return segments.filter((s) => statuses.includes(s.status)).reduce((acc, s) => acc + hours(s.startedAt, s.endedAt), 0);
}

/** Ciclo Kanban + flow efficiency sobre issues (de tipos contados) resueltos en la ventana. */
export function kanbanCycle(issues: SystemIssue[], window: Window, opts: KanbanOptions = {}): KanbanFlow {
  const K = KANBAN_STATUSES;
  const engStatuses = [K.inProgress, K.inReview];
  const waitStatuses = [K.blocked, K.deployedDev, K.qaBusiness];
  const resolved = countedOnly(issues, opts.countedTypes).filter((i) => inWindow(i.resolvedAt, window)) as (SystemIssue & {
    resolvedAt: Date;
  })[];
  const cycle: number[] = [];
  const eng: number[] = [];
  const wait: number[] = [];
  let rework = 0;
  let closedBefore = 0;
  const perState = new Map<string, number[]>();
  for (const i of resolved) {
    const start = i.segments.find((s) => s.status === K.inProgress);
    if (start) cycle.push(hours(start.startedAt, i.resolvedAt));
    const e = sumIn(i.segments, engStatuses);
    const w = sumIn(i.segments, waitStatuses);
    eng.push(e);
    wait.push(w);
    if (i.segments.filter((s) => s.status === K.inProgress).length >= 2) rework += 1;
    if (i.deliveredAt && i.resolvedAt < i.deliveredAt) closedBefore += 1;
    const byStatus = new Map<string, number>();
    for (const s of i.segments) {
      if (s.status === K.done) continue;
      byStatus.set(s.status, (byStatus.get(s.status) ?? 0) + hours(s.startedAt, s.endedAt));
    }
    for (const [st, h] of byStatus) perState.set(st, [...(perState.get(st) ?? []), h]);
  }
  const engTotal = eng.reduce((a, b) => a + b, 0);
  const waitTotal = wait.reduce((a, b) => a + b, 0);
  const waited = wait.filter((w) => w > 0);
  const n = resolved.length;
  const flow = opts.statusFlow ?? [];
  const known = flow.filter((st) => perState.has(st));
  const rest = [...perState.keys()].filter((st) => !flow.includes(st)).sort();
  return {
    tickets: n,
    cycleKanbanH: quantile(cycle, 0.5),
    cycleKanbanP85H: quantile(cycle, 0.85),
    engineeringH: quantile(eng, 0.5),
    waitingH: quantile(waited, 0.5),
    pctWithWait: pct(waited.length, n),
    flowEfficiency: engTotal + waitTotal === 0 ? null : engTotal / (engTotal + waitTotal),
    states: [...known, ...rest].map((status) => {
      const hs = perState.get(status) as number[];
      return { status, p50H: quantile(hs, 0.5), pctOfTickets: pct(hs.length, n) };
    }),
    reworkPct: pct(rework, n),
    closedBeforeDeliveredPct: pct(closedBefore, n),
  };
}

export interface ClosureDay {
  date: string;
  /** Cierres de tipos contados (sin subtareas si así lo dice `countedTypes`). */
  closed: number;
  /** Cierres de todos los tipos, subtareas incluidas. */
  closedAll: number;
  viaQaNegocio: number;
}

export interface ClosureBatches {
  days: ClosureDay[];
  batches: ClosureDay[];
  weekdayHistogram: number[];
  hourHistogram: number[];
}

export const BATCH_MIN_CLOSED = 5;

/**
 * Lotes de cierre: cierres por día (UTC), días con ≥5 cierres (sobre `closedAll`),
 * histogramas por día de semana (0=domingo) y hora. `closed` solo cuenta tipos contados.
 */
export function closureBatches(issues: SystemIssue[], window: Window, opts: KanbanOptions = {}): ClosureBatches {
  const byDay = new Map<string, ClosureDay>();
  const weekdayHistogram = new Array<number>(7).fill(0);
  const hourHistogram = new Array<number>(24).fill(0);
  const counted = new Set(countedOnly(issues, opts.countedTypes).map((i) => i.key));
  for (const i of issues) {
    if (!inWindow(i.resolvedAt, window)) continue;
    const r = i.resolvedAt;
    const date = r.toISOString().slice(0, 10);
    const day = byDay.get(date) ?? { date, closed: 0, closedAll: 0, viaQaNegocio: 0 };
    day.closedAll += 1;
    if (counted.has(i.key)) day.closed += 1;
    if (i.segments.some((s) => s.status === KANBAN_STATUSES.qaBusiness)) day.viaQaNegocio += 1;
    byDay.set(date, day);
    weekdayHistogram[r.getUTCDay()] += 1;
    hourHistogram[r.getUTCHours()] += 1;
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { days, batches: days.filter((d) => d.closedAll >= BATCH_MIN_CLOSED), weekdayHistogram, hourHistogram };
}

export const SYSTEM_DEFINITIONS: Record<string, string> = {
  deploysPerWeek: 'Despliegues a producción con éxito por semana (workflow de deploy en ramas de producción).',
  cfr: 'Change failure rate: runs de despliegue fallidos sobre el total de runs de despliegue.',
  hotfixPct: '% de despliegues desde ramas hotfix/revert.',
  leadTimeH: 'Lead time: horas del primer commit al primer despliegue con éxito posterior al merge (p50/p85).',
  codingH: 'Horas del primer commit a la apertura del PR.',
  pickupH: 'Horas de la apertura del PR a la primera review humana.',
  reviewH: 'Horas de la primera review humana al merge.',
  mergeToProdH: 'Horas del merge al primer despliegue con éxito.',
  recoveryH: 'Horas de un despliegue fallido al siguiente con éxito.',
  sizeP50: 'Tamaño mediano del PR (líneas añadidas + borradas).',
  pctOver400: '% de PRs con más de 400 líneas cambiadas.',
  pctMergedWithoutHumanApproval: '% de PRs mergeados sin aprobación humana.',
  cycleKanbanH: 'Ciclo Kanban: horas desde el primer "En curso" hasta Finalizada (p50/p85). Solo tipos contados.',
  engineeringH: 'Tiempo de ingeniería: horas en "En curso" + "In review".',
  waitingH: 'Tiempo de espera: horas en "Blocked" + "Desplegado en DEV" + "QA Negocio" (mediana sobre tickets que esperaron).',
  pctWithWait: '% de tickets con alguna espera.',
  flowEfficiency: 'Flow efficiency: ingeniería / (ingeniería + espera).',
  reworkPct: '% de tickets que volvieron a "En curso" (≥2 visitas).',
  closedBeforeDeliveredPct: '% de tickets resueltos antes de su fecha de entrega.',
  batches: 'Días con 5 o más cierres (todos los tipos, subtareas incluidas): señal de cierre en lote. `closed` cuenta solo tipos contados.',
};

export interface SystemInput {
  prs: SystemPr[];
  runs: SystemRun[];
  issues: SystemIssue[];
  settings: SystemSettings;
}

/** Compone A–D en la respuesta de la vista "Sistema". */
export function systemSummary(input: SystemInput, window: Window) {
  return {
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    repos: doraPerRepo(input.prs, input.runs, input.settings, window),
    practice: prPractice(input.prs, input.settings, window),
    flow: kanbanCycle(input.issues, window, { statusFlow: input.settings.statusFlow, countedTypes: input.settings.countedTypes }),
    batches: closureBatches(input.issues, window, { countedTypes: input.settings.countedTypes }),
    definitions: SYSTEM_DEFINITIONS,
  };
}
