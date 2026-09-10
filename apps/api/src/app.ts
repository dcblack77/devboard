import { AppExpress } from '@expressots/adapter-express';
import { AppContainer, CreateModule } from '@expressots/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HealthController } from './modules/home/health.controller.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { SyncController } from './modules/sync/sync.controller.js';
import { resolveSession } from './middleware/auth.middleware.js';
import { startScheduler } from './jobs/scheduler.js';
import { loadEnv } from './config/env.js';
import { logger } from './config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class App extends AppExpress {
  private readonly container: AppContainer = this.configContainer([
    CreateModule([HealthController, AuthController, SyncController]),
  ]);

  override globalConfiguration(): void {
    this.setGlobalRoutePrefix('/');
    this.setBanner({ style: 'compact', showMetrics: false });
  }

  override async configureServices(): Promise<void> {
    const env = loadEnv();

    this.Middleware.parse({
      json: {},
      urlencoded: { extended: true },
      cookies: { secret: env.SESSION_SECRET },
    });
    this.Middleware.setErrorHandler({ showStackTrace: await this.isDevelopment() });
    this.Middleware.add(resolveSession);

    // Sirve los estáticos de apps/web (Fase 3) con fallback SPA; en dev, apps/web/dist puede
    // no existir todavía y `Middleware.static` simplemente no encontrará nada que servir.
    const webDist = path.resolve(__dirname, '../../web/dist');
    this.Middleware.static({ path: webDist, spa: true, index: 'index.html' });
  }

  override async postServerInitialization(): Promise<void> {
    startScheduler();
    logger.info('DevBoard API lista');
  }

  override async serverShutdown(): Promise<void> {
    logger.info('DevBoard API deteniéndose');
  }
}
