import cron from 'node-cron';
import { SnapshotKind } from '@teampulse/shared';
import { loadEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { SyncService } from '../modules/sync/sync.service.js';
import { takeSnapshot } from '../modules/snapshots/snapshots.controller.js';

let task: cron.ScheduledTask | undefined;
let weeklySnapshotTask: cron.ScheduledTask | undefined;

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

  if (!weeklySnapshotTask) {
    // Lunes 06:00 (hora del servidor): snapshot semanal automático de {home, teamSummary}.
    weeklySnapshotTask = cron.schedule('0 6 * * 1', () => {
      logger.info('scheduler: tomando snapshot semanal');
      takeSnapshot(SnapshotKind.Weekly).catch((err) => {
        logger.error({ err }, 'scheduler: snapshot semanal falló');
      });
    });
  }

  return task;
}

/** Solo para tests/shutdown: detiene el cron. */
export function stopScheduler(): void {
  task?.stop();
  task = undefined;
  weeklySnapshotTask?.stop();
  weeklySnapshotTask = undefined;
}
