import pino from 'pino';
import { loadEnv } from './env.js';

const env = loadEnv();

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
});
