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
