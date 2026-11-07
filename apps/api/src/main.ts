import 'reflect-metadata';
import { loadEnvSync, bootstrap } from '@expressots/core';
import { App } from './app.js';
import { loadEnv } from './config/env.js';
import { logger } from './config/logger.js';
import { seedSettings } from './db/seed.js';

loadEnvSync();

async function main() {
  const env = loadEnv();

  try {
    await seedSettings();
  } catch (err) {
    logger.error({ err }, 'No se pudo sembrar settings al arrancar (¿Postgres disponible?)');
  }

  await bootstrap(App, { port: env.PORT });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error fatal al arrancar Team Pulse API:', err);
  process.exit(1);
});
