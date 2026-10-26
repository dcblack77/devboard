/**
 * Adaptador de la vista "Sistema": convierte filas persistidas / issues analizados
 * en las entradas tipadas que consumen las métricas puras de `domain/metrics/system.ts`.
 *
 * Normalización de estados: `issue_status_segments.status` guarda el nombre CRUDO de
 * Jira (`In Progress`, `En curso`, `Done`, `Finalizada`, `IN REVIEW`…). Aquí se aplican
 * `settings.statusAliases` a cada tramo y se fusionan tramos adyacentes con el mismo
 * estado normalizado, para que `kanbanCycle` vea un único `En curso` continuo.
 * (`buildMetricsContext` ya aplica los alias a los tramos antes de `analyzeIssues`;
 * volver a aplicarlos es idempotente.)
 */
import type { AnalyzedIssue } from '../../domain/metrics/issues.js';
import { DEFAULT_BOT_PATTERNS } from '../../domain/metrics/github.js';
import type { SystemIssue, SystemPr, SystemRun, SystemSegment, SystemSettings } from '../../domain/metrics/system.js';
import type { pullRequests, prReviews, workflowRuns } from '../../db/schema.js';

type PrRow = typeof pullRequests.$inferSelect;
type ReviewRow = typeof prReviews.$inferSelect;
type RunRow = typeof workflowRuns.$inferSelect;

export type StatusAliases = Record<string, string>;

/** Aplica alias crudo→normalizado a un estado. */
export function normalizeStatus(status: string, aliases: StatusAliases): string {
  return aliases[status] ?? status;
}

/** Normaliza el estado de cada tramo y fusiona tramos adyacentes con el mismo estado normalizado. */
export function normalizeSegments(segments: SystemSegment[], aliases: StatusAliases): SystemSegment[] {
  const sorted = [...segments].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const out: SystemSegment[] = [];
  for (const s of sorted) {
    const status = normalizeStatus(s.status, aliases);
    const prev = out[out.length - 1];
    if (prev && prev.status === status && prev.endedAt.getTime() >= s.startedAt.getTime()) {
      prev.endedAt = new Date(Math.max(prev.endedAt.getTime(), s.endedAt.getTime()));
    } else {
      out.push({ status, startedAt: s.startedAt, endedAt: s.endedAt });
    }
  }
  return out;
}

/** Issues analizados (`analyzeIssues`) → SystemIssue con tramos normalizados y fusionados. */
export function toSystemIssues(rows: AnalyzedIssue[], aliases: StatusAliases): SystemIssue[] {
  return rows.map((r) => ({
    key: r.key,
    type: r.type ?? null,
    createdAt: r.created,
    resolvedAt: r.resolved,
    deliveredAt: r.deliveredAt,
    segments: normalizeSegments(r.segments, aliases),
  }));
}

function isBot(login: string | null): boolean {
  if (!login) return false;
  const lower = login.toLowerCase();
  return DEFAULT_BOT_PATTERNS.some((b) => lower.includes(b));
}

/** Filas crudas de PR + reviews → SystemPr. */
export function toSystemPrs(prRows: PrRow[], reviewRows: ReviewRow[]): SystemPr[] {
  const byPr = new Map<string, ReviewRow[]>();
  for (const r of reviewRows) byPr.set(r.prId, [...(byPr.get(r.prId) ?? []), r]);
  return prRows.map((p) => ({
    id: p.id,
    repo: p.repo,
    author: p.authorLogin,
    isBot: isBot(p.authorLogin),
    baseRef: p.baseRef,
    firstCommitAt: p.firstCommitAt,
    createdAt: p.createdAt,
    mergedAt: p.mergedAt,
    additions: p.additions,
    deletions: p.deletions,
    reviews: (byPr.get(p.id) ?? []).map((r) => ({
      author: r.reviewerLogin,
      isBot: r.isBot || isBot(r.reviewerLogin),
      state: r.state,
      submittedAt: r.submittedAt,
    })),
  }));
}

/** Filas crudas de `workflow_runs` → SystemRun. */
export function toSystemRuns(rows: RunRow[]): SystemRun[] {
  return rows.map((r) => ({
    id: r.id,
    repo: r.repo,
    name: r.name,
    headBranch: r.headBranch,
    conclusion: r.conclusion,
    createdAt: r.createdAt,
  }));
}

export function toSystemSettings(s: {
  deployWorkflow: string;
  deployBranches: string;
  featureBase: string;
  statusFlow?: string[];
  countedTypes?: string[];
}): SystemSettings {
  return {
    deployWorkflow: s.deployWorkflow,
    deployBranches: s.deployBranches,
    featureBase: s.featureBase,
    statusFlow: s.statusFlow ?? [],
    countedTypes: s.countedTypes ?? [],
  };
}
