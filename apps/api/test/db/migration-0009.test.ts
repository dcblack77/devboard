/**
 * Contrato: migración `0009_*.sql` (siguiente a 0008) que añade columnas NULLABLE para fechas y
 * estimación. No toca datos existentes; el relleno llega en el siguiente sync.
 *
 *   epics.start_date   date              (customfield_10014)
 *   epics.due_date     date              (duedate)
 *   epics.resolved_at  timestamptz       (resolutiondate)
 *   issues.due_date    date              (duedate)
 *   issues.story_points double precision (customfield_10015)
 *
 * El bloque «con Postgres real» se ejecuta solo si `MIGRATION_TEST_DATABASE_URL` apunta a una BD
 * VACÍA y desechable (p. ej. `docker run --rm -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16-alpine`).
 * Nunca apuntarlo a la BD real.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pkg from 'pg';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { epics, issues } from '../../src/db/schema.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../src/db/migrations');
const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const file0009 = files.find((f) => f.startsWith('0009_'));
const sql0009 = file0009 ? readFileSync(join(dir, file0009), 'utf8') : '';
const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> };

const NEW_COLUMNS: Array<[table: string, column: string, type: RegExp]> = [
  ['epics', 'start_date', /^date$/i],
  ['epics', 'due_date', /^date$/i],
  ['epics', 'resolved_at', /^timestamp( with time zone)?$/i],
  ['issues', 'due_date', /^date$/i],
  ['issues', 'story_points', /^(double precision|real|numeric)$/i],
];

describe('migración 0009 — fechas y estimación', () => {
  it('existe y es la última del journal (idx 9)', () => {
    expect(file0009).toBeTruthy();
    const last = journal.entries.at(-1)!;
    expect(last.idx).toBe(9);
    expect(last.tag).toBe(file0009!.replace(/\.sql$/, ''));
    expect(existsSnapshot(9)).toBe(true);
  });

  it('solo añade columnas nullable (sin NOT NULL, sin UPDATE/DELETE/DROP)', () => {
    for (const [table, column] of NEW_COLUMNS) {
      const re = new RegExp(`ALTER TABLE "${table}" ADD COLUMN (IF NOT EXISTS )?"${column}" [^;]+;`, 'i');
      const stmt = sql0009.match(re)?.[0];
      expect(stmt, `${table}.${column}`).toBeTruthy();
      expect(stmt!).not.toMatch(/NOT NULL/i);
    }
    expect(sql0009).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/i);
  });

  it('el schema de drizzle declara las mismas columnas nullable', () => {
    const cols = (t: typeof epics | typeof issues) => Object.fromEntries(getTableConfig(t).columns.map((c) => [c.name, c]));
    const e = cols(epics);
    const i = cols(issues);
    for (const [table, column] of NEW_COLUMNS) {
      const c = (table === 'epics' ? e : i)[column];
      expect(c, `${table}.${column}`).toBeTruthy();
      expect(c!.notNull).toBe(false);
    }
  });
});

function existsSnapshot(idx: number): boolean {
  return readdirSync(join(dir, 'meta')).includes(`${String(idx).padStart(4, '0')}_snapshot.json`);
}

const DB_URL = process.env.MIGRATION_TEST_DATABASE_URL;

describe.skipIf(!DB_URL)('migración 0009 con Postgres real (BD vacía desechable)', () => {
  const statements = (f: string) =>
    readFileSync(join(dir, f), 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

  it('se aplica sobre una BD con filas existentes y las conserva (columnas nuevas a NULL)', async () => {
    expect(file0009, 'falta src/db/migrations/0009_*.sql').toBeTruthy();
    const pool = new pkg.Pool({ connectionString: DB_URL });
    try {
      await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
      for (const f of files.filter((x) => x < '0009_')) for (const s of statements(f)) await pool.query(s);

      await pool.query(`INSERT INTO epics (key, summary, status, created_at) VALUES ('MAIN-1', 'Épica', 'En curso', now())`);
      await pool.query(
        `INSERT INTO issues (key, summary, type, status, status_norm, macro, epic_key, created_at, updated_at)
         VALUES ('MAIN-2', 'Historia', 'Historia', 'Por hacer', 'Por hacer', 'pendiente', 'MAIN-1', now(), now())`,
      );

      for (const s of statements(file0009!)) await pool.query(s);

      const cols = await pool.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
        `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('epics', 'issues')`,
      );
      for (const [table, column, type] of NEW_COLUMNS) {
        const c = cols.rows.find((r) => r.table_name === table && r.column_name === column);
        expect(c, `${table}.${column}`).toBeTruthy();
        expect(c!.data_type).toMatch(type);
        expect(c!.is_nullable).toBe('YES');
      }

      const e = await pool.query(`SELECT key, summary, start_date, due_date, resolved_at FROM epics`);
      expect(e.rows).toEqual([{ key: 'MAIN-1', summary: 'Épica', start_date: null, due_date: null, resolved_at: null }]);
      const i = await pool.query(`SELECT key, epic_key, due_date, story_points FROM issues`);
      expect(i.rows).toEqual([{ key: 'MAIN-2', epic_key: 'MAIN-1', due_date: null, story_points: null }]);

      // Las columnas aceptan los valores que escribe el sync.
      await pool.query(`UPDATE epics SET start_date = '2026-01-15', due_date = '2026-04-30', resolved_at = '2026-03-05T12:00:00Z'`);
      await pool.query(`UPDATE issues SET due_date = '2026-03-20', story_points = 2.5`);
      const back = await pool.query(`SELECT to_char(e.due_date, 'YYYY-MM-DD') AS due, i.story_points::float AS pts FROM epics e, issues i`);
      expect(back.rows).toEqual([{ due: '2026-04-30', pts: 2.5 }]);
    } finally {
      await pool.end();
    }
  });
});
