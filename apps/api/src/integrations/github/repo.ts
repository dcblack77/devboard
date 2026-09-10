/**
 * Interfaz de persistencia usada por GithubSync. Implementación real en
 * `repo.drizzle.ts`; se puede mockear en tests sin tocar Postgres.
 */
import type { ParsedPr } from './types.js';

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

export interface GithubRepo {
  /** Inserta/actualiza PRs (upsert por `id` = `repo#number`). */
  upsertPrs(items: PrUpsertInput[]): Promise<void>;
  /** Borra y reinserta las reviews de un PR. */
  replaceReviews(prId: string, reviews: ReviewUpsertInput[]): Promise<void>;
  /** Borra y reinserta las solicitudes de review de un PR. */
  replaceRequests(prId: string, requests: ReviewRequestUpsertInput[]): Promise<void>;
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
    erfKeys: parsed.issueKeys,
    hotfix: parsed.hotfix,
    raw: parsed,
  };
}
