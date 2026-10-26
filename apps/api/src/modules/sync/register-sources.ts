/**
 * Construye y registra las fuentes de sincronización reales (Jira, GitHub) a partir de
 * `settings` (Postgres) + variables de entorno, y las añade al registro (`registry.ts`) que
 * consume `SyncService`. Se llama una vez al arrancar (`app.ts::postServerInitialization`),
 * antes de que el scheduler o `POST /api/sync/run` disparen la primera ejecución.
 *
 * Si a una fuente le faltan credenciales, no se registra: `SyncService` deja una fila en
 * `sync_runs` con `ok=false` y `error='sin credenciales'` para esa fuente en cada ciclo, sin
 * afectar a la otra fuente (ver `sync.service.ts`).
 */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { settings, syncRuns } from '../../db/schema.js';
import { loadEnv } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { registerSource, type SourceSync } from './registry.js';
import { JiraSync } from '../../integrations/jira/sync.js';
import { DrizzleJiraRepo } from '../../integrations/jira/repo.drizzle.js';
import type { StatusAliasMap } from '../../integrations/jira/types.js';
import { GithubSync } from '../../integrations/github/sync.js';
import { DrizzleGithubRepo } from '../../integrations/github/repo.drizzle.js';

const DEFAULT_FINAL_STATUS = 'Finalizada';

/** Marca una fuente como no-registrable por falta de credenciales, dejando fila en sync_runs. */
async function recordMissingCredentials(source: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  await db.insert(syncRuns).values({
    source,
    startedAt,
    finishedAt: startedAt,
    ok: false,
    error: 'sin credenciales',
    counts: {},
  });
}

async function buildJiraSync(): Promise<SourceSync | null> {
  const env = loadEnv();
  if (!env.JIRA_BASE_URL || !env.JIRA_API_TOKEN || !env.JIRA_PROJECT) {
    logger.warn('Jira: faltan credenciales (JIRA_BASE_URL/JIRA_API_TOKEN/JIRA_PROJECT), se omite');
    await recordMissingCredentials('jira');
    return null;
  }
  // JIRA_EMAIL es obligatorio solo en modo 'basic' (Basic email:token); en 'bearer' (OAuth
  // 2.0/3LO) el token ya identifica al usuario.
  if (env.JIRA_AUTH_MODE === 'basic' && !env.JIRA_EMAIL) {
    logger.warn('Jira: falta JIRA_EMAIL para auth básica, se omite');
    await recordMissingCredentials('jira');
    return null;
  }

  const db = getDb();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);

  return new JiraSync({
    config: {
      baseUrl: env.JIRA_BASE_URL,
      email: env.JIRA_EMAIL ?? '',
      apiToken: env.JIRA_API_TOKEN,
      authMode: env.JIRA_AUTH_MODE,
    },
    settings: {
      project: env.JIRA_PROJECT,
      sinceDate: row?.sinceDate ?? env.SINCE_DATE ?? '2024-01-01',
      statusAliases: (row?.statusAliases as StatusAliasMap) ?? {},
      macroMap: (row?.macroMap as Record<string, string>) ?? {},
      finalStatus: DEFAULT_FINAL_STATUS,
    },
    repo: new DrizzleJiraRepo(db),
    logger,
  });
}

async function buildGithubSync(): Promise<SourceSync | null> {
  const env = loadEnv();
  const repos = (env.GITHUB_REPOS ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  if (!env.GITHUB_TOKEN || !env.GITHUB_ORG || repos.length === 0) {
    logger.warn('GitHub: faltan credenciales (GITHUB_TOKEN/GITHUB_ORG/GITHUB_REPOS), se omite');
    await recordMissingCredentials('github');
    return null;
  }

  const db = getDb();
  const sinceRaw = env.SINCE_DATE ?? '2024-01-01';
  const since = new Date(sinceRaw);

  const issueKeyRegex = env.JIRA_PROJECT ? new RegExp(`\\b${env.JIRA_PROJECT}-\\d+\\b`, 'gi') : undefined;

  return new GithubSync({
    settings: { org: env.GITHUB_ORG, repos, since, issueKeyRegex },
    token: env.GITHUB_TOKEN,
    repo: new DrizzleGithubRepo(db),
    lastSync: {
      async lastOkFinishedAt(source: string): Promise<Date | null> {
        const [last] = await db
          .select({ finishedAt: syncRuns.finishedAt })
          .from(syncRuns)
          .where(and(eq(syncRuns.source, source), eq(syncRuns.ok, true)))
          .orderBy(desc(syncRuns.startedAt))
          .limit(1);
        return last?.finishedAt ?? null;
      },
    },
  });
}

/** Registra JiraSync y GithubSync si hay credenciales suficientes. Idempotente. */
export async function registerRealSources(): Promise<void> {
  const jira = await buildJiraSync().catch((err) => {
    logger.error({ err }, 'No se pudo construir JiraSync');
    return null;
  });
  if (jira) registerSource(jira);

  const github = await buildGithubSync().catch((err) => {
    logger.error({ err }, 'No se pudo construir GithubSync');
    return null;
  });
  if (github) registerSource(github);
}
