import { AppExpress } from '@expressots/adapter-express';
import { AppContainer, CreateModule } from '@expressots/core';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HealthController } from './modules/home/health.controller.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { SyncController } from './modules/sync/sync.controller.js';
import { resolveSession } from './middleware/auth.middleware.js';
import { startScheduler } from './jobs/scheduler.js';
import { registerRealSources } from './modules/sync/register-sources.js';
import { SyncService } from './modules/sync/sync.service.js';
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
    });
    // cookie-parser montado explícitamente: `Middleware.parse({ cookies })` de ExpressoTS lo
    // resuelve dinámicamente con `require.resolve` desde `process.cwd()`, lo que falla en
    // ESM/monorepo y deja `req.cookies` vacío (la sesión nunca se lee).
    this.Middleware.add(cookieParser(env.SESSION_SECRET));
    this.Middleware.setErrorHandler({
      showStackTrace: await this.isDevelopment(),
      // Registramos un errorHandler propio para no perder nunca el error real: el handler
      // por defecto de ExpressoTS solo devuelve "An unexpected error occurred." al cliente
      // y no loguea nada, lo que convertía cualquier fallo (p.ej. el ENOENT del fallback SPA
      // descrito abajo) en un 500 opaco e indiagnosticable. Logueamos con pino y delegamos
      // el formateo de la respuesta al comportamiento estándar de ExpressoTS.
      errorHandler: (error: unknown, req: Request, res: Response, _next: NextFunction) => {
        logger.error(
          { err: error, path: req.path, method: req.method },
          'Error no controlado en un handler HTTP',
        );
        const status =
          error && typeof error === 'object' && 'statusCode' in error
            ? Number((error as { statusCode: unknown }).statusCode) || 500
            : 500;
        const message =
          status !== 500 && error instanceof Error ? error.message : 'An unexpected error occurred.';
        res.status(status).json({ code: status, error: message });
      },
    });
    this.Middleware.add(resolveSession);

    // Sirve los estáticos de apps/web (Fase 3) con fallback SPA; en dev, apps/web/dist puede
    // no existir todavía y simplemente no se sirve nada.
    //
    // No usamos `Middleware.static({ spa: true })` de @expressots/core: su fallback SPA se
    // registra como middleware global (afecta también a /api/*) y construye la ruta del
    // index.html de forma incorrecta (concatena una ruta absoluta bajo `root: process.cwd()`),
    // lo que provoca un ENOENT que el error handler global convierte en un 500 opaco para
    // *cualquier* petición, incluida /api/health. En su lugar montamos estáticos + fallback
    // SPA manualmente con Express, excluyendo siempre /api/*.
    const webDist = path.resolve(__dirname, '../../web/dist');
    const indexHtml = path.join(webDist, 'index.html');
    if (existsSync(webDist)) {
      this.Middleware.add(express.static(webDist));
      this.Middleware.add((req: Request, res: Response, next: NextFunction) => {
        if (req.method !== 'GET' || req.path.startsWith('/api/')) {
          next();
          return;
        }
        if (existsSync(indexHtml)) {
          res.sendFile(indexHtml);
        } else {
          next();
        }
      });
    }
  }

  override async postServerInitialization(): Promise<void> {
    await registerRealSources().catch((err) => {
      logger.error({ err }, 'No se pudieron registrar las fuentes de sincronización reales');
    });
    startScheduler();
    // Sync inicial al arrancar si hay credenciales (Fase 1, §1.6); no bloquea el arranque del
    // servidor ni tumba el proceso si falla.
    new SyncService().runAll().catch((err) => {
      logger.error({ err }, 'Sync inicial al arrancar falló');
    });
    logger.info('DevBoard API lista');
  }

  override async serverShutdown(): Promise<void> {
    logger.info('DevBoard API deteniéndose');
  }
}
