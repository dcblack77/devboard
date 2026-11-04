/**
 * Sugerencia automática de niveles en skills de **dominio** (repos de GitHub y épicas de
 * Jira) a partir de la actividad de los últimos 365 días. Función pura, sin I/O.
 *
 * Reglas por (persona, repo | épica):
 * - 0 → sin actividad (no se emite sugerencia).
 * - 1 → 1–2 PRs mergeados, o ≥1 review, o ≥1 issue.
 * - 2 → ≥3 PRs mergeados, o ≥5 reviews (repo) · ≥3 issues (épica).
 * - 3 → ≥5 PRs/issues **y** ≥30 % del total del repo / épica.
 */

export interface SuggestPr {
  repo: string;
  authorPersonId: number | null;
  mergedAt: Date | null;
}

export interface SuggestReview {
  repo: string;
  reviewerPersonId: number | null;
  submittedAt: Date | null;
}

export interface SuggestEpicAssignment {
  epicKey: string;
  personId: number | null;
  /** Fecha de referencia de la asignación (resolución o actualización del issue). */
  at: Date | null;
}

export interface SuggestInput {
  prs: SuggestPr[];
  reviews: SuggestReview[];
  epicAssignments: SuggestEpicAssignment[];
  /** Inicio de la ventana (normalmente `now - 365 días`). */
  since: Date;
  now?: Date;
}

export interface DomainSuggestion {
  personId: number;
  kind: 'repo' | 'epic';
  /** Nombre del repo o clave de la épica. */
  key: string;
  level: 1 | 2 | 3;
  evidence: string;
}

const REFERENT_SHARE = 0.3;
const REFERENT_MIN = 5;

function inWindow(at: Date | null, since: Date): at is Date {
  return at !== null && at.getTime() >= since.getTime();
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Nivel para una persona en un repo según PRs mergeados, reviews y cuota del repo. */
function repoLevel(prs: number, reviews: number, repoTotal: number): 1 | 2 | 3 | 0 {
  if (prs >= REFERENT_MIN && prs / repoTotal >= REFERENT_SHARE) return 3;
  if (prs >= 3 || reviews >= 5) return 2;
  if (prs >= 1 || reviews >= 1) return 1;
  return 0;
}

/** Nivel para una persona en una épica según issues asignados y cuota de la épica. */
function epicLevel(issues: number, epicTotal: number): 1 | 2 | 3 | 0 {
  if (issues >= REFERENT_MIN && issues / epicTotal >= REFERENT_SHARE) return 3;
  if (issues >= 3) return 2;
  if (issues >= 1) return 1;
  return 0;
}

export function suggestDomainLevels(input: SuggestInput): DomainSuggestion[] {
  const { since } = input;

  // repo -> personId -> { prs, reviews }; repo -> total PRs mergeados
  const byRepo = new Map<string, Map<number, { prs: number; reviews: number }>>();
  const repoTotals = new Map<string, number>();
  const bump = (repo: string, personId: number, field: 'prs' | 'reviews') => {
    const people = byRepo.get(repo) ?? new Map<number, { prs: number; reviews: number }>();
    const stat = people.get(personId) ?? { prs: 0, reviews: 0 };
    stat[field] += 1;
    people.set(personId, stat);
    byRepo.set(repo, people);
  };

  for (const pr of input.prs) {
    if (!inWindow(pr.mergedAt, since)) continue;
    repoTotals.set(pr.repo, (repoTotals.get(pr.repo) ?? 0) + 1);
    if (pr.authorPersonId === null) continue;
    bump(pr.repo, pr.authorPersonId, 'prs');
  }
  for (const r of input.reviews) {
    if (r.reviewerPersonId === null || !inWindow(r.submittedAt, since)) continue;
    bump(r.repo, r.reviewerPersonId, 'reviews');
  }

  // epic -> personId -> issues; epic -> total issues
  const byEpic = new Map<string, Map<number, number>>();
  const epicTotals = new Map<string, number>();
  for (const a of input.epicAssignments) {
    if (!inWindow(a.at, since)) continue;
    epicTotals.set(a.epicKey, (epicTotals.get(a.epicKey) ?? 0) + 1);
    if (a.personId === null) continue;
    const people = byEpic.get(a.epicKey) ?? new Map<number, number>();
    people.set(a.personId, (people.get(a.personId) ?? 0) + 1);
    byEpic.set(a.epicKey, people);
  }

  const out: DomainSuggestion[] = [];

  for (const [repo, people] of byRepo) {
    const total = repoTotals.get(repo) ?? 0;
    for (const [personId, stat] of people) {
      const level = repoLevel(stat.prs, stat.reviews, total);
      if (level === 0) continue;
      const evidence = `${plural(stat.prs, 'PR mergeado', 'PRs mergeados')}, ${plural(stat.reviews, 'review', 'reviews')}, ${pct(stat.prs, total)}% del repo`;
      out.push({ personId, kind: 'repo', key: repo, level, evidence });
    }
  }

  for (const [epicKey, people] of byEpic) {
    const total = epicTotals.get(epicKey) ?? 0;
    for (const [personId, issues] of people) {
      const level = epicLevel(issues, total);
      if (level === 0) continue;
      const evidence = `${plural(issues, 'issue', 'issues')}, ${pct(issues, total)}% de la épica`;
      out.push({ personId, kind: 'epic', key: epicKey, level, evidence });
    }
  }

  return out.sort((a, b) => a.personId - b.personId || a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
}

/** Nombre canónico de la skill de dominio de una épica: `DEV-12 · Nombre de la épica`. */
export function epicSkillName(epicKey: string, summary: string): string {
  return `${epicKey} · ${summary.trim()}`;
}
