import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pkg from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { skills } from './schema.js';
import { DEFAULT_SKILLS } from './seed-skills.js';

const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://devboard:devboard@localhost:5433/devboard';
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log('Aplicando migraciones...');
  await migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') });
  console.log('Migraciones aplicadas correctamente.');

  // Catálogo por defecto de skills (competencias + stack): idempotente, nunca pisa ediciones.
  await db.insert(skills).values(DEFAULT_SKILLS).onConflictDoNothing({ target: skills.name });
  console.log('Catálogo de skills por defecto comprobado.');

  await pool.end();
}

main().catch((err) => {
  console.error('Error aplicando migraciones:', err);
  process.exit(1);
});
