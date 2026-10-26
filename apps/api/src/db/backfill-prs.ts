/**
 * Backfill de `pull_requests.first_commit_at` / `base_ref` para PRs sincronizados antes de
 * que la consulta GraphQL trajera esos campos. El sync normal es incremental por `updated`,
 * así que los PRs antiguos se quedarían a null para siempre sin este paso.
 *
 * Estrategia: para cada repo de `GITHUB_REPOS`, busca con `searchPullRequests` los PRs
 * mergeados en los últimos `BACKFILL_DAYS` (400 por defecto) con `created:>=` desde esa
 * fecha, re-parsea con `toPullRequest` y hace el mismo upsert que el sync (que ya actualiza
 * `first_commit_at`/`base_ref` en conflicto). Solo reescribe los PRs que en DB tengan
 * `first_commit_at IS NULL`; el resto se salta sin tocar.
 *
 * Uso (una vez, tras desplegar la migración 0004):
 *   npm run db:backfill-prs -w apps/api
 *   BACKFILL_DAYS=200 npm run db:backfill-prs -w apps/api
 */
import 'dotenv/config';
import { isNull } from 'drizzle-orm';
import { getDb, closeDb } from './client.js';
import { pullRequests } from './schema.js';
import { loadEnv } from '../config/env.js';
import { GithubClient } from '../integrations/github/client.js';
import { monthRanges } from '../integrations/github/fetch.js';
import { toPullRequest, DEFAULT_BOT_PATTERNS, DEFAULT_HOTFIX_REGEX } from '../integrations/github/parse.js';
import { toPrUpsertInput } from '../integrations/github/repo.js';
import { DrizzleGithubRepo } from '../integrations/github/repo.drizzle.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const repos = (env.GITHUB_REPOS ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  if (!env.GITHUB_TOKEN || !env.GITHUB_ORG || repos.length === 0) {
    throw new Error('Faltan GITHUB_TOKEN / GITHUB_ORG / GITHUB_REPOS');
  }
  const days = Number(process.env.BACKFILL_DAYS ?? '400');
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);

  const db = getDb();
  const repo = new DrizzleGithubRepo(db);
  const pending = await db
    .select({ id: pullRequests.id })
    .from(pullRequests)
    .where(isNull(pullRequests.firstCommitAt));
  const pendingIds = new Set(pending.map((p) => p.id));
  console.log(`PRs con first_commit_at NULL en DB: ${pendingIds.size}`);
  if (pendingIds.size === 0) return;

  const client = new GithubClient({ token: env.GITHUB_TOKEN, org: env.GITHUB_ORG, repos });
  await client.whoAmI();
  const issueKeyRegex = env.JIRA_PROJECT ? new RegExp(`\\b${env.JIRA_PROJECT}-\\d+\\b`, 'gi') : undefined;

  let updated = 0;
  let seen = 0;
  // Partido por meses para no chocar con el límite de 1000 resultados de la búsqueda.
  for (const repoName of repos) {
    for (const [a, b] of monthRanges(since, new Date(now.getTime() + DAY_MS))) {
      const bInclusive = new Date(b.getTime() - DAY_MS);
      const q = `repo:${env.GITHUB_ORG}/${repoName} is:pr is:merged created:${fmt(a)}..${fmt(bInclusive)}`;
      for await (const node of client.searchPullRequests(q)) {
        seen += 1;
        const parsed = toPullRequest(node, {
          botPatterns: DEFAULT_BOT_PATTERNS,
          hotfixRegex: DEFAULT_HOTFIX_REGEX,
          issueKeyRegex,
        });
        if (!pendingIds.has(parsed.id)) continue;
        await repo.upsertPrs([toPrUpsertInput(parsed)]);
        updated += 1;
      }
    }
    console.log(`${repoName}: vistos ${seen}, actualizados ${updated} (apiCalls ${client.apiCalls})`);
  }
  console.log(`Backfill terminado: ${updated} PRs actualizados de ${pendingIds.size} pendientes.`);
}

main()
  .catch((err) => {
    console.error('Error en backfill:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
