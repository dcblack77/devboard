import cron from 'node-cron';
import { loadEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { SyncService } from '../modules/sync/sync.service.js';

let task: cron.ScheduledTask | undefined;

/**
 * Arranca el cron interno que llama a `SyncService.runAll()` cada `SYNC_MINUTES`.
 * Las integraciones reales (Jira/GitHub) se registran vía `registerSource()` antes de
 * llamar a esta función; si no hay ninguna registrada, cada tick deja igualmente constancia
 * en `sync_runs` (ver `SyncService`).
 */
export function startScheduler(): cron.ScheduledTask {
  if (task) return task;

  const env = loadEnv();
  const syncService = new SyncService();
  const expression = `*/${env.SYNC_MINUTES} * * * *`;

  task = cron.schedule(expression, () => {
    logger.info({ syncMinutes: env.SYNC_MINUTES }, 'scheduler: iniciando sync programada');
    syncService.runAll().catch((err) => {
      logger.error({ err }, 'scheduler: sync programada falló');
    });
  });

  logger.info({ expression }, 'scheduler iniciado');
  return task;
}

/** Solo para tests/shutdown: detiene el cron. */
export function stopScheduler(): void {
  task?.stop();
  task = undefined;
}
