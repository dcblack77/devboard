import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import { loadEnv } from '../config/env.js';
import * as schema from './schema.js';

const { Pool } = pkg;

let pool: InstanceType<typeof Pool> | undefined;

export function getPool(): InstanceType<typeof Pool> {
  if (!pool) {
    const env = loadEnv();
    pool = new Pool({ connectionString: env.DATABASE_URL });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export async function pingDb(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
