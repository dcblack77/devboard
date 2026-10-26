/**
 * Sincronización incremental de GitHub → Postgres. Implementa `SourceSync`
 * (interfaz canónica en `src/modules/sync/registry.ts`).
 */
import { GithubClient } from './client.js';
import { fetchRepoPrs } from './fetch.js';
import { toPullRequest, DEFAULT_BOT_PATTERNS, DEFAULT_HOTFIX_REGEX } from './parse.js';
import { listWorkflowRuns } from './rest.js';
import { toPrUpsertInput, toWorkflowRunUpsertInput } from './repo.js';
import type { GithubRepo } from './repo.js';
import type { GithubConfig } from './types.js';
import type { SourceSync } from '../../modules/sync/registry.js';

export type { SourceSync };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Último sync ok de una fuente, para calcular `lastFetchedAt` incremental. */
export interface LastSyncLookup {
  /** Devuelve `finishedAt` del último `sync_runs` con `ok=true` para `source`, o null si no hay ninguno. */
  lastOkFinishedAt(source: string): Promise<Date | null>;
}

export interface GithubSyncSettings {
  org: string;
  repos: string[];
  /** Fecha desde la que interesan PRs en la primera carga. */
  since: Date;
  /** Regex de hotfix (título+rama). Por defecto DEFAULT_HOTFIX_REGEX. */
  hotfixRegex?: RegExp;
  /** Regex de claves de issue, derivada del proyecto Jira: /\bPROJECT-\d+\b/gi. */
  issueKeyRegex?: RegExp;
  /** Patrones de login de bot. Por defecto DEFAULT_BOT_PATTERNS. */
  botPatterns?: string[];
}

export interface GithubSyncDeps {
  settings: GithubSyncSettings;
  token: string;
  repo: GithubRepo;
  lastSync: LastSyncLookup;
  /** Fábrica de cliente inyectable para tests. */
  clientFactory?: (config: GithubConfig) => GithubClient;
}

export class GithubSync implements SourceSync {
  readonly name = 'github';

  constructor(private readonly deps: GithubSyncDeps) {}

  async run(): Promise<{ counts: { prs: number; reviews: number; runs: number; repos: number; apiCalls: number } }> {
    const { settings, token, repo, lastSync } = this.deps;
    const lastFetchedAt = (await lastSync.lastOkFinishedAt('github')) ?? undefined;

    const client = this.deps.clientFactory
      ? this.deps.clientFactory({ token, org: settings.org, repos: settings.repos })
      : new GithubClient({ token, org: settings.org, repos: settings.repos });

    // Sonda de auth antes de nada: que un token revocado falle el run en vez de
    // dejar un sync "vacío" con ok=true.
    await client.whoAmI();

    let prCount = 0;
    let reviewCount = 0;
    let runCount = 0;

    // Workflow runs (REST): incremental por `created` desde la última sync ok menos 1 día;
    // en la primera carga, desde la misma `since` que los PRs.
    const runsCreatedSince = lastFetchedAt ? new Date(lastFetchedAt.getTime() - DAY_MS) : settings.since;

    for (const repoName of settings.repos) {
      const nodes = await fetchRepoPrs(client, {
        org: settings.org,
        repo: repoName,
        since: settings.since,
        lastFetchedAt,
      });

      const parsed = nodes.map((node) =>
        toPullRequest(node, {
          botPatterns: settings.botPatterns ?? DEFAULT_BOT_PATTERNS,
          hotfixRegex: settings.hotfixRegex ?? DEFAULT_HOTFIX_REGEX,
          issueKeyRegex: settings.issueKeyRegex,
        }),
      );

      if (parsed.length > 0) {
        await repo.upsertPrs(parsed.map(toPrUpsertInput));
      }
      for (const pr of parsed) {
        await repo.replaceReviews(
          pr.id,
          pr.reviews.map((r) => ({
            reviewerLogin: r.reviewerLogin,
            state: r.state,
            submittedAt: r.submittedAt,
            isBot: r.isBot,
          })),
        );
        await repo.replaceRequests(
          pr.id,
          pr.reviewRequests.map((r) => ({ at: r.at, requestedLogin: r.requestedLogin })),
        );
        reviewCount += pr.reviews.length;
      }
      prCount += parsed.length;

      const runs = await listWorkflowRuns(client, repoName, { createdSince: runsCreatedSince });
      if (runs.length > 0) {
        await repo.upsertWorkflowRuns(runs.map((r) => toWorkflowRunUpsertInput(repoName, r)));
      }
      runCount += runs.length;
    }

    // apiCalls: búsquedas GraphQL efectuadas por el cliente (la sonda whoAmI no cuenta).
    const apiCalls = client.apiCalls;

    return { counts: { prs: prCount, reviews: reviewCount, runs: runCount, repos: settings.repos.length, apiCalls } };
  }
}
