import { eq } from 'drizzle-orm';
import { DEFAULT_THRESHOLDS, MacroStatus, legacyBoards } from '@devboard/shared';
import { getDb } from './client.js';
import { settings } from './schema.js';
import { loadEnv } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Flujo de estados por defecto, genérico (sin nada específico de ningún tablero real).
 * Se puede reconfigurar después desde `/settings`.
 */
const DEFAULT_STATUS_FLOW = ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'];

const DEFAULT_STATUS_ALIASES: Record<string, string> = {
  'Por hacer': 'To Do',
  'En curso': 'In Progress',
  'En revisión': 'In Review',
  Bloqueada: 'Blocked',
  Finalizada: 'Done',
};

const DEFAULT_MACRO_MAP: Record<string, MacroStatus> = {
  Backlog: MacroStatus.Pending,
  'To Do': MacroStatus.Pending,
  Blocked: MacroStatus.Blocked,
  'In Progress': MacroStatus.InProgress,
  'In Review': MacroStatus.InProgress,
  Done: MacroStatus.Delivered,
  Closed: MacroStatus.Closed,
};

const DEFAULT_COUNTED_TYPES = ['Historia', 'Tarea', 'Error', 'Story', 'Task', 'Bug'];

/** Vista "Sistema" (DORA): despliegue = workflow `Deployment` sobre main/hotfix; CI = workflows `CI*`; feature PR = base `develop`. */
export const DEFAULT_SISTEMA = {
  deployWorkflow: 'Deployment',
  deployBranches: '^main$|hotfix',
  ciWorkflowRegex: '^CI',
  featureBase: 'develop',
} as const;

/**
 * Siembra idempotente de la fila singleton `settings` (id=1) a partir de las variables de
 * entorno. Si ya existe, no la sobrescribe (la UI de settings es la fuente de verdad tras el
 * primer arranque).
 */
export async function seedSettings(): Promise<void> {
  const env = loadEnv();
  const db = getDb();

  const existing = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (existing.length > 0) {
    logger.info('settings ya existe, no se resiembra');
    return;
  }

  await db.insert(settings).values({
    id: 1,
    jiraBoards: legacyBoards(env.JIRA_PROJECT, null),
    sinceDate: env.SINCE_DATE ?? null,
    syncMinutes: env.SYNC_MINUTES,
    attentionDays: 5,
    reviewDays: 2,
    waitReviewHours: 24,
    thresholds: DEFAULT_THRESHOLDS,
    statusFlow: DEFAULT_STATUS_FLOW,
    statusAliases: DEFAULT_STATUS_ALIASES,
    macroMap: DEFAULT_MACRO_MAP,
    countedTypes: DEFAULT_COUNTED_TYPES,
    hotfixRegex: null,
    deployWorkflow: DEFAULT_SISTEMA.deployWorkflow,
    deployBranches: DEFAULT_SISTEMA.deployBranches,
    ciWorkflowRegex: DEFAULT_SISTEMA.ciWorkflowRegex,
    featureBase: DEFAULT_SISTEMA.featureBase,
  });

  logger.info('settings sembrada con valores por defecto');
}
