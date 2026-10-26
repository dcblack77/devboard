/**
 * Interfaz de persistencia usada por GithubSync. Implementación real en
 * `repo.drizzle.ts`; se puede mockear en tests sin tocar Postgres.
 */
import type { ParsedPr, WorkflowRunApi } from './types.js';

export interface PrUpsertInput {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  authorLogin: string | null;
  createdAt: Date;
  readyAt: Date | null;
  mergedAt: Date | null;
  closedAt: Date | null;
  mergedByLogin: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRef: string | null;
  baseRef: string | null;
  firstCommitAt: Date | null;
  erfKeys: string[];
  hotfix: boolean;
  raw: unknown;
}

export interface ReviewUpsertInput {
  reviewerLogin: string;
  state: string;
  submittedAt: Date | null;
  isBot: boolean;
}

export interface ReviewRequestUpsertInput {
  at: Date;
  requestedLogin: string;
}

/** Fila de `workflow_runs` lista para upsert (por `id`). */
export interface WorkflowRunUpsertInput {
  id: number;
  repo: string;
  name: string | null;
  event: string | null;
  status: string | null;
  conclusion: string | null;
  headBranch: string | null;
  headSha: string | null;
  runAttempt: number | null;
  createdAt: Date;
  runStartedAt: Date | null;
  updatedAt: Date | null;
}

export interface GithubRepo {
  /** Inserta/actualiza PRs (upsert por `id` = `repo#number`). */
  upsertPrs(items: PrUpsertInput[]): Promise<void>;
  /** Borra y reinserta las reviews de un PR. */
  replaceReviews(prId: string, reviews: ReviewUpsertInput[]): Promise<void>;
  /** Borra y reinserta las solicitudes de review de un PR. */
  replaceRequests(prId: string, requests: ReviewRequestUpsertInput[]): Promise<void>;
  /** Inserta/actualiza workflow runs (upsert por `id`; en conflicto refresca status/conclusion/updated_at/run_attempt). */
  upsertWorkflowRuns(rows: WorkflowRunUpsertInput[]): Promise<void>;
}

/** Adapta una workflow run REST al shape que espera el repo. */
export function toWorkflowRunUpsertInput(repo: string, run: WorkflowRunApi): WorkflowRunUpsertInput {
  return {
    id: run.id,
    repo,
    name: run.name ?? null,
    event: run.event ?? null,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    headBranch: run.head_branch ?? null,
    headSha: run.head_sha ?? null,
    runAttempt: run.run_attempt ?? null,
    createdAt: new Date(run.created_at),
    runStartedAt: run.run_started_at ? new Date(run.run_started_at) : null,
    updatedAt: run.updated_at ? new Date(run.updated_at) : null,
  };
}

/** Adapta una ParsedPr al shape que espera el repo. */
export function toPrUpsertInput(parsed: ParsedPr): PrUpsertInput {
  return {
    id: parsed.id,
    repo: parsed.repo,
    number: parsed.number,
    title: parsed.title,
    url: parsed.url,
    state: parsed.state,
    isDraft: parsed.isDraft,
    authorLogin: parsed.authorLogin,
    createdAt: parsed.createdAt,
    readyAt: parsed.readyAt,
    mergedAt: parsed.mergedAt,
    closedAt: parsed.closedAt,
    mergedByLogin: parsed.mergedByLogin,
    additions: parsed.additions,
    deletions: parsed.deletions,
    changedFiles: parsed.changedFiles,
    headRef: parsed.headRef,
    baseRef: parsed.baseRef,
    firstCommitAt: parsed.firstCommitAt,
    erfKeys: parsed.issueKeys,
    hotfix: parsed.hotfix,
    raw: parsed,
  };
}
