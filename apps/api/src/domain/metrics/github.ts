/**
 * Métricas puras de code review (GitHub). Portado 1:1 de
 * workspace/team-board/github_reviews.py (`analyze`, `stats`, `mean`,
 * `week_key`) y de `sem` de render_v4.py.
 *
 * Reciben datos ya cargados (filas del schema Drizzle) + `now` + settings;
 * no acceden a la base de datos.
 */
import type { pullRequests, prReviews, prReviewRequests } from '../../db/schema.js';
import { boardOf, devBoards, type SettingsDto } from '@devboard/shared';

export type PullRequestRow = typeof pullRequests.$inferSelect;
export type PrReviewRow = typeof prReviews.$inferSelect;
export type PrReviewRequestRow = typeof prReviewRequests.$inferSelect;

/** Patrones de login (en minúsculas) que identifican cuentas bot. */
export const DEFAULT_BOT_PATTERNS = ['dependabot', 'github-actions', 'renovate', 'copilot'];
export const DEFAULT_HOTFIX_REGEX = /(^|[^a-z])(hf|hotfix|hot-fix)([^a-z]|$)/i;

/** Estado narrativo de una PR analizada. */
export type PrAnalyzedState = 'mergeada' | 'cerrada sin merge' | 'borrador' | 'abierta';

export interface AnalyzedReview {
  reviewer: string;
  state: string;
  at: Date;
}

/** PR analizada: salida de `analyzePullRequests`, entrada de `reviewStats`. */
export interface AnalyzedPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  state: PrAnalyzedState;
  draft: boolean;
  created: Date;
  ready: Date;
  merged: Date | null;
  closed: Date | null;
  mergedBy: string | null;
  additions: number;
  deletions: number;
  files: number;
  size: number;
  reviews: AnalyzedReview[];
  reviewers: string[];
  approvals: number;
  copilotReviews: number;
  changesRequested: number;
  requested: string[];
  hFirstReview: number | null;
  hToMerge: number | null;
  hOpen: number | null;
  selfMergedNoApproval: boolean;
  hotfix: boolean;
  issueKeys: string[];
  week: string | null;
}

export interface PersonReviewStats {
  prs: number;
  merged: number;
  merged4w: number;
  open: number;
  open7d: number;
  hFirstReviewMean: number | null;
  hToMergeMean: number | null;
  hToMergeMax: number | null;
  sizeMean: number | null;
  reviews: number;
  prsReviewed: number;
  approvals: number;
  changesRequested: number;
  authorsReviewed: number;
  hResponseMean: number | null;
  selfMergedNoApproval: number;
  hotfix: number;
  balance: number | null;
}

export interface WeeklyReviewStats {
  week: string;
  merged: number;
  daysToMergeMean: number | null;
  reviews: number;
  hotfix: number;
}

export interface RepoReviewStats {
  repo: string;
  prs: number;
  merged: number;
  open: number;
  hToMergeMean: number | null;
  hFirstReviewMean: number | null;
}

export interface ReviewStats {
  total: number;
  merged: number;
  open: number;
  merged4w: number;
  hFirstReviewMean: number | null;
  hToMergeMean: number | null;
  hToMergeMax: number | null;
  pctMergedNoApproval: number;
  mergedNoApproval: number;
  hotfix: number;
  hotfix4w: number;
  people: Record<string, PersonReviewStats>;
  weekly: WeeklyReviewStats[];
  repos: RepoReviewStats[];
  waiting: AnalyzedPr[];
  stale: AnalyzedPr[];
}

export type SemaphoreColor = 'g' | 'a' | 'r' | '';

/** Ajustes mínimos que necesita esta pieza de dominio (subconjunto de `SettingsDto`). */
export type GithubMetricsSettings = Pick<SettingsDto, 'jiraBoards' | 'waitReviewHours'>;

const WAIT_REVIEW_HOURS_DEFAULT = 48;
const STALE_HOURS = 24 * 7;

/** Diferencia en horas entre dos instantes, o `null` si falta alguno. */
export function hoursBetween(a: Date | null | undefined, b: Date | null | undefined): number | null {
  if (!a || !b) return null;
  return (b.getTime() - a.getTime()) / 1000 / 3600;
}

/** Media aritmética, o `null` si el array está vacío. */
export function meanOf(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  if (nums.length === 0) return null;
  return nums.reduce((acc, v) => acc + v, 0) / nums.length;
}

/** Clave de semana ISO ("YYYY-Www") de una fecha, igual que `datetime.isocalendar()` de Python. */
export function weekKeyOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lunes=0 .. domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jueves de esta semana ISO
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function isBotLogin(login: string, botPatterns: string[]): boolean {
  const lower = login.toLowerCase();
  return botPatterns.some((b) => lower.includes(b));
}

/** Regex de claves de issue de cualquier tablero de desarrollo (null si no hay ninguno). */
function buildIssueKeyRegex(devKeys: string[]): RegExp | null {
  if (devKeys.length === 0) return null;
  return new RegExp(`\\b(?:${devKeys.join('|')})-\\d+\\b`, 'gi');
}

function extractIssueKeys(text: string, regex: RegExp | null): string[] {
  if (!regex) return [];
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  const matches = text.match(re) ?? [];
  return [...new Set(matches.map((m) => m.toUpperCase()))].sort();
}

/**
 * Analiza PRs crudas (filas `pull_requests` + `pr_reviews` + `pr_review_requests`)
 * y produce la lista de `AnalyzedPr`, ordenada por fecha de creación descendente.
 * Portado de `github_reviews.py::analyze`.
 */
export function analyzePullRequests(
  prs: PullRequestRow[],
  reviews: PrReviewRow[],
  reviewRequests: PrReviewRequestRow[],
  settings: GithubMetricsSettings,
  now: Date,
  canon: (login: string) => string,
): AnalyzedPr[] {
  const reviewsByPr = new Map<string, PrReviewRow[]>();
  for (const r of reviews) {
    const list = reviewsByPr.get(r.prId) ?? [];
    list.push(r);
    reviewsByPr.set(r.prId, list);
  }
  const requestsByPr = new Map<string, PrReviewRequestRow[]>();
  for (const rr of reviewRequests) {
    const list = requestsByPr.get(rr.prId) ?? [];
    list.push(rr);
    requestsByPr.set(rr.prId, list);
  }

  const devKeys = devBoards(settings).map((b) => b.key.toUpperCase());
  const issueKeyRegex = buildIssueKeyRegex(devKeys);
  const botPatterns = DEFAULT_BOT_PATTERNS;

  const out: AnalyzedPr[] = [];
  for (const pr of prs) {
    const authorLogin = pr.authorLogin ?? '?';
    if (isBotLogin(authorLogin, botPatterns)) continue;

    const author = canon(authorLogin);
    const ready = pr.readyAt ?? pr.createdAt;
    const merged = pr.mergedAt ?? null;
    const closed = pr.closedAt ?? null;

    const rawReviews = reviewsByPr.get(pr.id) ?? [];
    const copilotReviews = rawReviews.filter((r) => r.reviewerLogin.toLowerCase().includes('copilot')).length;

    const humanReviews: AnalyzedReview[] = [];
    for (const r of rawReviews) {
      if (r.reviewerLogin === authorLogin) continue;
      if (isBotLogin(r.reviewerLogin, botPatterns)) continue;
      if (!r.submittedAt || r.state === 'PENDING') continue;
      humanReviews.push({ reviewer: canon(r.reviewerLogin), state: r.state, at: r.submittedAt });
    }
    humanReviews.sort((a, b) => a.at.getTime() - b.at.getTime());

    const firstReview = humanReviews.length > 0 ? humanReviews[0]!.at : null;
    const approvals = humanReviews.filter((r) => r.state === 'APPROVED');
    const changesRequested = humanReviews.filter((r) => r.state === 'CHANGES_REQUESTED').length;

    const requested = [...new Set(
      (requestsByPr.get(pr.id) ?? []).map((rr) => canon(rr.requestedLogin)),
    )].sort();

    const state: PrAnalyzedState = merged
      ? 'mergeada'
      : closed
        ? 'cerrada sin merge'
        : pr.isDraft
          ? 'borrador'
          : 'abierta';

    const combinedText = `${pr.title} ${pr.headRef ?? ''}`;
    const issueKeysAll = extractIssueKeys(combinedText, issueKeyRegex);
    const issueKeys = devKeys.length > 0 ? issueKeysAll.filter((k) => devKeys.includes(boardOf(k))) : issueKeysAll;
    const hotfix = DEFAULT_HOTFIX_REGEX.test(combinedText);

    out.push({
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author,
      state,
      draft: pr.isDraft,
      created: pr.createdAt,
      ready,
      merged,
      closed,
      mergedBy: merged ? (pr.mergedByLogin ? canon(pr.mergedByLogin) : null) : null,
      additions: pr.additions,
      deletions: pr.deletions,
      files: pr.changedFiles,
      size: pr.additions + pr.deletions,
      reviews: humanReviews,
      reviewers: [...new Set(humanReviews.map((r) => r.reviewer))].sort(),
      approvals: approvals.length,
      copilotReviews,
      changesRequested,
      requested,
      hFirstReview: hoursBetween(ready, firstReview),
      hToMerge: merged ? hoursBetween(ready, merged) : null,
      hOpen: !merged && !closed && !pr.isDraft ? hoursBetween(ready, now) : null,
      selfMergedNoApproval: Boolean(merged) && approvals.length === 0,
      hotfix,
      issueKeys,
      week: merged ? weekKeyOf(merged) : null,
    });
  }

  out.sort((a, b) => b.created.getTime() - a.created.getTime());
  return out;
}

interface PersonAcc {
  prs: number;
  merged: number;
  merged4w: number;
  open: number;
  open7d: number;
  hFirstReview: number[];
  hToMerge: number[];
  size: number[];
  reviews: number;
  prsReviewed: Set<string>;
  approvals: number;
  changesRequested: number;
  authorsReviewed: Set<string>;
  hResponse: number[];
  selfMergedNoApproval: number;
  hotfix: number;
}

function newPersonAcc(): PersonAcc {
  return {
    prs: 0,
    merged: 0,
    merged4w: 0,
    open: 0,
    open7d: 0,
    hFirstReview: [],
    hToMerge: [],
    size: [],
    reviews: 0,
    prsReviewed: new Set(),
    approvals: 0,
    changesRequested: 0,
    authorsReviewed: new Set(),
    hResponse: [],
    selfMergedNoApproval: 0,
    hotfix: 0,
  };
}

/**
 * Agregados de equipo/persona/semana/repo a partir de PRs ya analizadas.
 * Portado de `github_reviews.py::stats`.
 */
export function reviewStats(
  prs: AnalyzedPr[],
  now: Date,
  weeks: string[],
  settings: GithubMetricsSettings,
): ReviewStats {
  const cutoff4w = new Date(now.getTime() - 4 * 7 * 24 * 3600 * 1000);
  const merged = prs.filter((p) => p.merged);
  const openPrs = prs.filter((p) => p.state === 'abierta');
  const waitReviewHours = settings.waitReviewHours ?? WAIT_REVIEW_HOURS_DEFAULT;

  const people = new Map<string, PersonAcc>();
  const getPerson = (name: string): PersonAcc => {
    let acc = people.get(name);
    if (!acc) {
      acc = newPersonAcc();
      people.set(name, acc);
    }
    return acc;
  };

  for (const p of prs) {
    const a = getPerson(p.author);
    a.prs += 1;
    if (p.merged) {
      a.merged += 1;
      if (p.hToMerge !== null) a.hToMerge.push(p.hToMerge);
      a.size.push(p.size);
      if (p.merged >= cutoff4w) a.merged4w += 1;
      if (p.selfMergedNoApproval) a.selfMergedNoApproval += 1;
      if (p.hotfix) a.hotfix += 1;
    }
    if (p.state === 'abierta') {
      a.open += 1;
      if ((p.hOpen ?? 0) > STALE_HOURS) a.open7d += 1;
    }
    if (p.hFirstReview !== null) a.hFirstReview.push(p.hFirstReview);

    const seen = new Set<string>();
    for (const r of p.reviews) {
      const v = getPerson(r.reviewer);
      v.reviews += 1;
      v.prsReviewed.add(`${p.repo}#${p.number}`);
      v.authorsReviewed.add(p.author);
      if (r.state === 'APPROVED') v.approvals += 1;
      else if (r.state === 'CHANGES_REQUESTED') v.changesRequested += 1;
      if (!seen.has(r.reviewer)) {
        seen.add(r.reviewer);
        const h = hoursBetween(p.ready, r.at);
        if (h !== null && h >= 0) v.hResponse.push(h);
      }
    }
  }

  const outPeople: Record<string, PersonReviewStats> = {};
  for (const [name, v] of people.entries()) {
    outPeople[name] = {
      prs: v.prs,
      merged: v.merged,
      merged4w: v.merged4w,
      open: v.open,
      open7d: v.open7d,
      hFirstReviewMean: meanOf(v.hFirstReview),
      hToMergeMean: meanOf(v.hToMerge),
      hToMergeMax: v.hToMerge.length ? Math.max(...v.hToMerge) : null,
      sizeMean: meanOf(v.size),
      reviews: v.reviews,
      prsReviewed: v.prsReviewed.size,
      approvals: v.approvals,
      changesRequested: v.changesRequested,
      authorsReviewed: v.authorsReviewed.size,
      hResponseMean: meanOf(v.hResponse),
      selfMergedNoApproval: v.selfMergedNoApproval,
      hotfix: v.hotfix,
      balance: v.merged > 0 ? v.reviews / v.merged : null,
    };
  }

  const weekly = new Map<string, { merged: number; hToMerge: number[]; reviews: number; hotfix: number }>();
  for (const w of weeks) weekly.set(w, { merged: 0, hToMerge: [], reviews: 0, hotfix: 0 });
  for (const p of merged) {
    if (!p.merged) continue;
    const w = weekKeyOf(p.merged);
    const bucket = weekly.get(w);
    if (!bucket) continue;
    bucket.merged += 1;
    if (p.hToMerge !== null) bucket.hToMerge.push(p.hToMerge);
    if (p.hotfix) bucket.hotfix += 1;
  }
  for (const p of prs) {
    for (const r of p.reviews) {
      const w = weekKeyOf(r.at);
      const bucket = weekly.get(w);
      if (bucket) bucket.reviews += 1;
    }
  }
  const weeklyOut: WeeklyReviewStats[] = weeks.map((w) => {
    const x = weekly.get(w)!;
    const daysMean = meanOf(x.hToMerge);
    return {
      week: w,
      merged: x.merged,
      daysToMergeMean: daysMean !== null ? Math.round((daysMean / 24) * 10) / 10 : null,
      reviews: x.reviews,
      hotfix: x.hotfix,
    };
  });

  const byRepo = new Map<string, { prs: number; merged: number; hToMerge: number[]; hFirstReview: number[]; open: number }>();
  for (const p of prs) {
    let r = byRepo.get(p.repo);
    if (!r) {
      r = { prs: 0, merged: 0, hToMerge: [], hFirstReview: [], open: 0 };
      byRepo.set(p.repo, r);
    }
    r.prs += 1;
    if (p.merged) {
      r.merged += 1;
      if (p.hToMerge !== null) r.hToMerge.push(p.hToMerge);
    }
    if (p.hFirstReview !== null) r.hFirstReview.push(p.hFirstReview);
    if (p.state === 'abierta') r.open += 1;
  }
  const repos: RepoReviewStats[] = [...byRepo.entries()]
    .sort((a, b) => b[1].prs - a[1].prs)
    .map(([repo, v]) => ({
      repo,
      prs: v.prs,
      merged: v.merged,
      open: v.open,
      hToMergeMean: meanOf(v.hToMerge),
      hFirstReviewMean: meanOf(v.hFirstReview),
    }));

  const waiting = openPrs
    .filter((p) => p.reviews.length === 0 && (p.hOpen ?? 0) > waitReviewHours)
    .sort((a, b) => (b.hOpen ?? 0) - (a.hOpen ?? 0));
  const stale = openPrs
    .filter((p) => p.reviews.length > 0 && (p.hOpen ?? 0) > STALE_HOURS)
    .sort((a, b) => (b.hOpen ?? 0) - (a.hOpen ?? 0));

  const mergedNoApprovalCount = merged.filter((p) => p.selfMergedNoApproval).length;

  return {
    total: prs.length,
    merged: merged.length,
    open: openPrs.length,
    merged4w: merged.filter((p) => p.merged! >= cutoff4w).length,
    hFirstReviewMean: meanOf(prs.map((p) => p.hFirstReview)),
    hToMergeMean: meanOf(merged.map((p) => p.hToMerge)),
    hToMergeMax: merged.length ? Math.max(...merged.map((p) => p.hToMerge ?? -Infinity)) : null,
    pctMergedNoApproval: merged.length ? Math.round((100 * mergedNoApprovalCount) / merged.length) : 0,
    mergedNoApproval: mergedNoApprovalCount,
    hotfix: merged.filter((p) => p.hotfix).length,
    hotfix4w: merged.filter((p) => p.hotfix && p.merged! >= cutoff4w).length,
    people: outPeople,
    weekly: weeklyOut,
    repos,
    waiting,
    stale,
  };
}

/** Semáforo genérico: 'g'/'a'/'r', o '' si no hay valor. Portado de `render_v4.py::sem`. */
export function semaphore(
  value: number | null | undefined,
  good: number,
  bad: number,
  lowerIsBetter = true,
): SemaphoreColor {
  if (value === null || value === undefined) return '';
  if (lowerIsBetter) {
    if (value <= good) return 'g';
    if (value >= bad) return 'r';
    return 'a';
  }
  if (value >= good) return 'g';
  if (value <= bad) return 'r';
  return 'a';
}

export interface ReviewSemaphores {
  balance: SemaphoreColor;
  response: SemaphoreColor;
  firstReview: SemaphoreColor;
  noApproval: SemaphoreColor;
  stalePrs: SemaphoreColor;
}

/** Aplica los umbrales de `SettingsDto.thresholds` a las stats de una persona. */
export function reviewSemaphores(
  personStats: PersonReviewStats,
  thresholds: SettingsDto['thresholds'],
): ReviewSemaphores {
  return {
    balance: semaphore(personStats.balance, thresholds.balanceAmber, thresholds.balanceRed, false),
    response: semaphore(
      personStats.hResponseMean,
      thresholds.responseGreenHours,
      thresholds.responseRedHours,
      true,
    ),
    firstReview: semaphore(
      personStats.hFirstReviewMean,
      thresholds.firstReviewGreenHours,
      thresholds.firstReviewRedHours,
      true,
    ),
    noApproval: semaphore(
      personStats.selfMergedNoApproval,
      0,
      thresholds.noApprovalRed,
      true,
    ),
    stalePrs: semaphore(personStats.open7d, 0, thresholds.stalePrsRed, true),
  };
}
