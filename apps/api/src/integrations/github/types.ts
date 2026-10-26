/**
 * Tipos compartidos de la integración GitHub.
 */

export interface GithubConfig {
  /** Personal Access Token con permisos de lectura sobre repos/PRs. */
  token: string;
  org: string;
  repos: string[];
  /** Timeout por petición en ms (default 40000, como la referencia Python). */
  timeoutMs?: number;
  /** Número de reintentos en 502/503/504/red (default 4). */
  maxRetries?: number;
  /** fetch implementation inyectable para tests (default global fetch). */
  fetchImpl?: typeof fetch;
  /** Reloj inyectable para tests (default () => new Date()). */
  now?: () => Date;
  /** sleep inyectable para tests de rate limit (default setTimeout real). */
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface GithubUserRef {
  login: string;
}

export interface GithubReviewNode {
  author: GithubUserRef | null;
  state: string;
  submittedAt: string | null;
}

export type TimelineItemNode =
  | { __typename: 'ReadyForReviewEvent'; createdAt: string }
  | { __typename: 'ConvertToDraftEvent'; createdAt: string }
  | {
      __typename: 'ReviewRequestedEvent';
      createdAt: string;
      requestedReviewer: { login?: string; name?: string } | null;
    };

/** Nodo `PullRequest` tal y como lo devuelve la búsqueda GraphQL. */
export interface PrNode {
  number: number;
  title: string;
  url: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  isDraft: boolean;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRefName: string | null;
  /** Rama base (destino) del PR. Opcional: fixtures/consultas antiguas no lo traen. */
  baseRefName?: string | null;
  /** Primer commit del PR en orden de PR (`commits(first: 1)` devuelve el MÁS ANTIGUO). */
  commits?: { nodes: Array<{ commit: { authoredDate: string | null; committedDate: string | null } }> } | null;
  repository: { name: string };
  author: GithubUserRef | null;
  mergedBy: GithubUserRef | null;
  reviews: { nodes: GithubReviewNode[] };
  timelineItems: { nodes: TimelineItemNode[] };
}

export interface RateLimit {
  remaining: number;
  resetAt: string;
}

export interface SearchPage {
  issueCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: (PrNode | null)[];
}

export interface SearchResponse {
  search: SearchPage;
  rateLimit: RateLimit;
}

/** Parámetros de fetch de PRs de un repo. */
export interface FetchRepoPrsParams {
  org: string;
  repo: string;
  /** Fecha desde la que interesan PRs (created:>= en primera carga). */
  since: Date;
  /** Última sync ok anterior; si está presente, se hace carga incremental. */
  lastFetchedAt?: Date;
  /** Instante "ahora" inyectable para tests. */
  now?: Date;
}

export interface ReviewParsed {
  reviewerLogin: string;
  state: string;
  submittedAt: Date;
  isBot: boolean;
}

export interface ReviewRequestParsed {
  at: Date;
  requestedLogin: string;
}

export type PrState = 'open' | 'merged' | 'closed';

/** PR ya parseada, lista para persistir/analizar. */
export interface ParsedPr {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: PrState;
  isDraft: boolean;
  authorLogin: string;
  createdAt: Date;
  readyAt: Date;
  mergedAt: Date | null;
  closedAt: Date | null;
  mergedByLogin: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRef: string | null;
  /** Rama base del PR (p.ej. `develop`), o null si la consulta no la trae. */
  baseRef: string | null;
  /** Fecha del primer commit del PR (min(authoredDate, committedDate)), o null si no hay commits. */
  firstCommitAt: Date | null;
  issueKeys: string[];
  hotfix: boolean;
  reviews: ReviewParsed[];
  reviewRequests: ReviewRequestParsed[];
}

export interface ParseOptions {
  /** Fragmentos de login (en minúsculas) que identifican cuentas bot. */
  botPatterns?: string[];
  /** Regex para detectar hotfixes en título+rama. */
  hotfixRegex?: RegExp;
  /** Regex (global) para extraer claves de issue en título+rama, p.ej. /\bPROJ-\d+\b/gi. */
  issueKeyRegex?: RegExp;
}

/** Workflow run tal y como la devuelve `GET /repos/{org}/{repo}/actions/runs` (campos usados). */
export interface WorkflowRunApi {
  id: number;
  name: string | null;
  event: string | null;
  status: string | null;
  conclusion: string | null;
  head_branch: string | null;
  head_sha: string | null;
  run_attempt: number | null;
  created_at: string;
  run_started_at: string | null;
  updated_at: string | null;
}
