import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';

process.env.DATABASE_URL ??= 'postgres://user:***@localhost:5432/devboard_test';
process.env.SESSION_SECRET ??= 'test-secret-at-least-16-chars';
process.env.TL_PASSWORD ??= 'test-tl-password';
process.env.NODE_ENV = 'test';

vi.mock('../../src/domain/context.js', () => ({
  getMetricsContext: vi.fn(),
  invalidateMetricsContext: vi.fn(),
}));
vi.mock('../../src/jobs/scheduler.js', () => ({ startScheduler: vi.fn() }));
vi.mock('../../src/modules/sync/register-sources.js', () => ({ registerRealSources: vi.fn().mockResolvedValue(undefined) }));

interface IniRow {
  id: number;
  name: string;
  slug: string;
  position: number;
  source: string;
  epicKey: string | null;
}
interface IeRow {
  id: number;
  initiativeId: number;
  epicKey: string;
}

/**
 * Fake mínimo de drizzle para `initiatives` / `initiative_epics`: soporta las cadenas
 * fluidas que usa el controller (select/update/insert/delete) y distingue la tabla por
 * identidad del objeto `pgTable` importado del schema real.
 */
const state = { initiatives: [] as IniRow[], initiativeEpics: [] as IeRow[] };

const { initiatives, initiativeEpics } = await import('../../src/db/schema.js');

function tableOf(t: unknown): IniRow[] | IeRow[] {
  if (t === initiatives) return state.initiatives;
  if (t === initiativeEpics) return state.initiativeEpics;
  throw new Error('tabla no soportada en el fake');
}

// `eq(col, value)` de drizzle devuelve un SQL; aquí lo sustituimos por un predicado simple:
// el controller solo filtra por `id` (initiatives) o `initiativeId` (initiative_epics).
function matcher(cond: unknown, rows: Array<Record<string, unknown>>) {
  const c = cond as { queryChunks?: unknown[] };
  // drizzle `eq()` -> SQL con chunks [col, ' = ', param]; sacamos col.name y param.value
  const chunks = (c.queryChunks ?? []) as Array<{ constructor: { name: string } }>;
  const col = chunks.find((x) => x?.constructor?.name !== 'StringChunk' && 'name' in x) as unknown as { name: string } | undefined;
  const param = chunks.find((x) => x?.constructor?.name === 'Param') as unknown as { value: unknown } | undefined;
  if (!col || !param) throw new Error('condición no soportada en el fake');
  const key = col.name === 'initiative_id' ? 'initiativeId' : col.name;
  return rows.filter((r) => r[key] === param.value);
}

function fakeDb() {
  return {
    select: () => ({
      from: (t: unknown) => {
        const rows = tableOf(t) as Array<Record<string, unknown>>;
        const p = Promise.resolve(rows.map((r) => ({ ...r })));
        return Object.assign(p, {
          where: (cond: unknown) => {
            const filtered = matcher(cond, rows).map((r) => ({ ...r }));
            const wp = Promise.resolve(filtered);
            return Object.assign(wp, { limit: (n: number) => Promise.resolve(filtered.slice(0, n)) });
          },
        });
      },
    }),
    update: (t: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (cond: unknown) => {
          const rows = tableOf(t) as Array<Record<string, unknown>>;
          const hit = matcher(cond, rows);
          for (const r of hit) Object.assign(r, patch);
          const p = Promise.resolve(undefined);
          return Object.assign(p, { returning: () => Promise.resolve(hit.map((r) => ({ ...r }))) });
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: (vals: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const rows = tableOf(t) as Array<Record<string, unknown>>;
        const list = Array.isArray(vals) ? vals : [vals];
        const inserted = list.map((v) => {
          const row = { id: rows.length + 1, source: 'manual', epicKey: null, position: 0, ...v };
          rows.push(row);
          return { ...row };
        });
        const p = Promise.resolve(undefined);
        return Object.assign(p, { returning: () => Promise.resolve(inserted) });
      },
    }),
    delete: (t: unknown) => ({
      where: (cond: unknown) => {
        const rows = tableOf(t) as Array<Record<string, unknown>>;
        const hit = matcher(cond, rows);
        for (const r of hit) rows.splice(rows.indexOf(r), 1);
        const p = Promise.resolve(undefined);
        return Object.assign(p, { returning: () => Promise.resolve(hit.map((r) => ({ id: r.id }))) });
      },
    }),
  };
}

vi.mock('../../src/db/client.js', () => ({
  getPool: vi.fn(),
  getDb: vi.fn(() => fakeDb()),
  pingDb: vi.fn().mockResolvedValue(true),
  closeDb: vi.fn(),
}));

const { bootstrap } = await import('@expressots/core');
const { App } = await import('../../src/app.js');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const instance = await bootstrap(App, { port: 0 });
  server = await instance.getHttpServer();
  baseUrl = `http://127.0.0.1:${await instance.getPort()}`;
});

afterAll(async () => {
  server?.close();
});

beforeEach(() => {
  state.initiatives = [
    { id: 1, name: 'Onboarding', slug: 'dev-1-onboarding', position: 0, source: 'auto', epicKey: 'DEV-1' },
    { id: 2, name: 'Q4', slug: 'q4', position: 0, source: 'manual', epicKey: null },
  ];
  state.initiativeEpics = [
    { id: 1, initiativeId: 1, epicKey: 'DEV-1' },
    { id: 2, initiativeId: 2, epicKey: 'DEV-7' },
  ];
});

async function tl() {
  const agent = request.agent(baseUrl);
  await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
  return agent;
}

describe('/api/settings/initiatives — iniciativas auto', () => {
  it('GET expone source y epicKey', async () => {
    const agent = await tl();
    const res = await agent.get('/api/settings/initiatives');
    expect(res.status).toBe(200);
    expect(res.body.initiatives).toEqual([
      { id: 1, name: 'Onboarding', slug: 'dev-1-onboarding', position: 0, source: 'auto', epicKey: 'DEV-1', epicKeys: ['DEV-1'] },
      { id: 2, name: 'Q4', slug: 'q4', position: 0, source: 'manual', epicKey: null, epicKeys: ['DEV-7'] },
    ]);
  });

  it('PUT que cambia el nombre de una auto la fija como manual-renamed', async () => {
    const agent = await tl();
    const res = await agent.put('/api/settings/initiatives/1').send({ name: 'Onboarding (mi nombre)' });
    expect(res.status).toBe(200);
    expect(res.body.initiative).toMatchObject({ id: 1, name: 'Onboarding (mi nombre)', source: 'manual-renamed', epicKey: 'DEV-1' });
    expect(state.initiatives[0]).toMatchObject({ name: 'Onboarding (mi nombre)', source: 'manual-renamed' });
  });

  it('PUT con el mismo nombre no cambia source', async () => {
    const agent = await tl();
    const res = await agent.put('/api/settings/initiatives/1').send({ name: 'Onboarding' });
    expect(res.status).toBe(200);
    expect(res.body.initiative.source).toBe('auto');
  });

  it('PUT que solo toca épicas o posición de una auto no cambia source', async () => {
    const agent = await tl();
    const res = await agent.put('/api/settings/initiatives/1').send({ position: 3, epicKeys: ['DEV-1', 'DEV-9'] });
    expect(res.status).toBe(200);
    expect(res.body.initiative).toMatchObject({ source: 'auto', position: 3, epicKeys: ['DEV-1', 'DEV-9'] });
  });

  it('renombrar una manual la deja manual', async () => {
    const agent = await tl();
    const res = await agent.put('/api/settings/initiatives/2').send({ name: 'Q4 2026' });
    expect(res.status).toBe(200);
    expect(res.body.initiative.source).toBe('manual');
  });

  it('POST crea con source manual', async () => {
    const agent = await tl();
    const res = await agent.post('/api/settings/initiatives').send({ name: 'Nueva', slug: 'nueva' });
    expect(res.status).toBe(201);
    expect(res.body.initiative).toMatchObject({ name: 'Nueva', slug: 'nueva', source: 'manual', epicKey: null, epicKeys: [] });
  });
});
