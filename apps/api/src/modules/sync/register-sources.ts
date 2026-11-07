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
import { JiraClient } from '../../integrations/jira/client.js';
import { SupportSync } from '../../integrations/support/sync.js';
import { DrizzleSupportRepo } from '../../integrations/support/repo.drizzle.js';
import { devProjectKeys, supportProjectKeys } from '../../integrations/jira/boards.js';
import type { JiraBoard } from '@teampulse/shared';

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
  // Los tableros de desarrollo no son obligatorios al arrancar: se resuelven en cada run desde
  // `settings.jiraBoards` (Ajustes → Tableros de Jira) con fallback a JIRA_PROJECT.
  if (!env.JIRA_BASE_URL || !env.JIRA_API_TOKEN) {
    logger.warn('Jira: faltan credenciales (JIRA_BASE_URL/JIRA_API_TOKEN), se omite');
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

  return new JiraSync({
    config: {
      baseUrl: env.JIRA_BASE_URL,
      email: env.JIRA_EMAIL ?? '',
      apiToken: env.JIRA_API_TOKEN,
      authMode: env.JIRA_AUTH_MODE,
    },
    loadSettings: async () => {
      const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
      return {
        projects: devProjectKeys(row?.jiraBoards as JiraBoard[] | undefined, env.JIRA_PROJECT),
        sinceDate: row?.sinceDate ?? env.SINCE_DATE ?? '2024-01-01',
        statusAliases: (row?.statusAliases as StatusAliasMap) ?? {},
        macroMap: (row?.macroMap as Record<string, string>) ?? {},
        finalStatus: DEFAULT_FINAL_STATUS,
      };
    },
    repo: new DrizzleJiraRepo(db),
    logger,
  });
}

/** Fin del último run correcto de una fuente en `sync_runs` (null si nunca). */
async function lastOkFinishedAt(source: string): Promise<Date | null> {
  const db = getDb();
  const [last] = await db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.source, source), eq(syncRuns.ok, true)))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  return last?.finishedAt ?? null;
}

/**
 * Backup de los tableros de soporte. Usa las mismas credenciales que Jira; sin ellas no se
 * registra (Jira ya deja la fila 'sin credenciales'). Los tableros se leen en cada run de
 * `settings.jiraBoards` (kind support); sin ninguno el run devuelve `skipped`.
 */
async function buildSupportSync(): Promise<SourceSync | null> {
  const env = loadEnv();
  if (!env.JIRA_BASE_URL || !env.JIRA_API_TOKEN) return null;
  if (env.JIRA_AUTH_MODE === 'basic' && !env.JIRA_EMAIL) return null;

  const db = getDb();
  return new SupportSync({
    client: new JiraClient({
      baseUrl: env.JIRA_BASE_URL,
      email: env.JIRA_EMAIL ?? '',
      apiToken: env.JIRA_API_TOKEN,
      authMode: env.JIRA_AUTH_MODE,
    }),
    repo: new DrizzleSupportRepo(db),
    loadSettings: async () => {
      const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
      return { projects: supportProjectKeys(row?.jiraBoards as JiraBoard[] | undefined) };
    },
    lastOkFinishedAt: () => lastOkFinishedAt('support'),
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

  // Claves de issue en título/rama: cualquier tablero de desarrollo (fallback JIRA_PROJECT).
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  const devKeys = devProjectKeys(row?.jiraBoards as JiraBoard[] | undefined, env.JIRA_PROJECT);
  const issueKeyRegex = devKeys.length > 0 ? new RegExp(`\\b(?:${devKeys.join('|')})-\\d+\\b`, 'gi') : undefined;

  return new GithubSync({
    settings: { org: env.GITHUB_ORG, repos, since, issueKeyRegex },
    token: env.GITHUB_TOKEN,
    repo: new DrizzleGithubRepo(db),
    lastSync: { lastOkFinishedAt },
  });
}

/** Registra JiraSync, SupportSync y GithubSync si hay credenciales suficientes. Idempotente. */
export async function registerRealSources(): Promise<void> {
  const jira = await buildJiraSync().catch((err) => {
    logger.error({ err }, 'No se pudo construir JiraSync');
    return null;
  });
  if (jira) registerSource(jira);

  const support = await buildSupportSync().catch((err) => {
    logger.error({ err }, 'No se pudo construir SupportSync');
    return null;
  });
  if (support) registerSource(support);

  const github = await buildGithubSync().catch((err) => {
    logger.error({ err }, 'No se pudo construir GithubSync');
    return null;
  });
  if (github) registerSource(github);
}
