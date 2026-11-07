import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { boardOf, devBoards, legacyBoards, supportBoards, type JiraBoard } from '@devboard/shared';

const BOARDS: JiraBoard[] = [
  { key: 'MAIN', kind: 'dev', name: null },
  { key: 'SUP', kind: 'support', name: 'Soporte' },
  { key: 'OPS', kind: 'dev' },
  { key: 'HELP', kind: 'support', name: null },
];

describe('tableros de Jira · helpers', () => {
  it('devBoards / supportBoards filtran por tipo conservando el orden', () => {
    expect(devBoards({ jiraBoards: BOARDS }).map((b) => b.key)).toEqual(['MAIN', 'OPS']);
    expect(supportBoards({ jiraBoards: BOARDS }).map((b) => b.key)).toEqual(['SUP', 'HELP']);
    expect(devBoards({ jiraBoards: [] })).toEqual([]);
    expect(supportBoards({ jiraBoards: undefined as unknown as JiraBoard[] })).toEqual([]);
  });

  it('boardOf devuelve el prefijo antes del último guion', () => {
    expect(boardOf('MAIN-12')).toBe('MAIN');
    expect(boardOf('MY_OPS-7')).toBe('MY_OPS');
    expect(boardOf('A-B-3')).toBe('A-B');
    expect(boardOf('NOKEY')).toBe('NOKEY');
  });

  it('legacyBoards reproduce la forma de la migración (dev + support, sin nulos)', () => {
    expect(legacyBoards('MAIN', 'SUP')).toEqual([
      { key: 'MAIN', kind: 'dev' },
      { key: 'SUP', kind: 'support' },
    ]);
    expect(legacyBoards('MAIN', null)).toEqual([{ key: 'MAIN', kind: 'dev' }]);
    expect(legacyBoards(null, 'SUP')).toEqual([{ key: 'SUP', kind: 'support' }]);
    expect(legacyBoards(null, null)).toEqual([]);
    expect(legacyBoards('', '  ')).toEqual([]);
  });
});

describe('migración jira_boards', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../../src/db/migrations');
  const file = readdirSync(dir).find((f) => /^0008_.*\.sql$/.test(f));
  const sql = file ? readFileSync(join(dir, file), 'utf8') : '';
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> };

  it('añade jira_boards, copia los valores antiguos y luego borra las columnas', () => {
    const add = sql.indexOf('ADD COLUMN "jira_boards" jsonb DEFAULT \'[]\'::jsonb NOT NULL');
    const copy = sql.search(/UPDATE "settings" SET "jira_boards"/);
    const dropMain = sql.indexOf('DROP COLUMN IF EXISTS "jira_project"');
    const dropSup = sql.indexOf('DROP COLUMN IF EXISTS "support_project"');
    expect(add).toBeGreaterThanOrEqual(0);
    expect(copy).toBeGreaterThan(add);
    expect(dropMain).toBeGreaterThan(copy);
    expect(dropSup).toBeGreaterThan(copy);
    expect(sql).toMatch(/'kind',\s*'dev'/);
    expect(sql).toMatch(/'kind',\s*'support'/);
  });
});
