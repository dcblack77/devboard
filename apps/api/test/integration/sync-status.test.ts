import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import { InMemorySyncRunsRepo } from '../fixtures/in-memory-sync-runs.repo.js';

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
vi.mock('../../src/db/client.js', () => ({
  getPool: vi.fn(),
  getDb: vi.fn(),
  pingDb: vi.fn().mockResolvedValue(true),
  closeDb: vi.fn(),
}));

// El controller construye `new SyncService()` ⇒ `new DrizzleSyncRunsRepo()`. Lo sustituimos
// por una instancia en memoria compartida que cada test rellena.
const repo = new InMemorySyncRunsRepo();
vi.mock('../../src/modules/sync/sync-runs.repo.js', () => ({
  DrizzleSyncRunsRepo: class {
    constructor() {
      return repo;
    }
  },
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
  repo.rows = [];
  repo.syncMinutesValue = 30;
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

describe('GET /api/sync/status — runs + health', () => {
  it('sin ejecuciones: runs vacío y ambas fuentes stale (lastOkAt null)', async () => {
    const res = await request(baseUrl).get('/api/sync/status');
    expect(res.status).toBe(200);
    expect(res.body.runs).toEqual([]);
    expect(res.body.health).toEqual({
      jira: { lastOkAt: null, stale: true, lastError: null },
      github: { lastOkAt: null, stale: true, lastError: null },
      support: { lastOkAt: null, stale: false, lastError: null },
    });
  });

  it('runs ok recientes en ambas fuentes ⇒ stale=false y lastOkAt ISO', async () => {
    const j = repo.seed({ source: 'jira', ok: true, counts: { issues: 100 }, startedAt: minutesAgo(12) });
    const g = repo.seed({ source: 'github', ok: true, counts: { prs: 3, apiCalls: 2 }, startedAt: minutesAgo(10) });

    const res = await request(baseUrl).get('/api/sync/status');
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(2);
    const jiraRun = res.body.runs.find((r: { source: string }) => r.source === 'jira');
    expect(jiraRun).toMatchObject({ source: 'jira', ok: true, counts: { issues: 100 } });
    expect(res.body.health.jira).toEqual({ lastOkAt: j.finishedAt!.toISOString(), stale: false, lastError: null });
    expect(res.body.health.github).toEqual({ lastOkAt: g.finishedAt!.toISOString(), stale: false, lastError: null });
  });

  it('última ejecución de jira fallida ⇒ stale=true con lastError, aunque hubo una ok reciente', async () => {
    repo.seed({ source: 'jira', ok: true, counts: { issues: 100 }, startedAt: minutesAgo(20) });
    repo.seed({
      source: 'jira',
      ok: false,
      error: 'Jira 401: credenciales inválidas o caducadas (JIRA_EMAIL / JIRA_API_TOKEN)',
      startedAt: minutesAgo(5),
    });
    repo.seed({ source: 'github', ok: true, counts: { prs: 0, apiCalls: 1 }, startedAt: minutesAgo(5) });

    const res = await request(baseUrl).get('/api/sync/status');
    expect(res.body.health.jira.stale).toBe(true);
    expect(res.body.health.jira.lastError).toContain('Jira 401');
    expect(res.body.health.jira.lastOkAt).not.toBeNull();
    expect(res.body.health.github.stale).toBe(false);
  });

  it('última ok más antigua que 3 × syncMinutes ⇒ stale=true sin lastError', async () => {
    repo.syncMinutesValue = 30;
    repo.seed({ source: 'jira', ok: true, counts: { issues: 100 }, startedAt: minutesAgo(95) });
    repo.seed({ source: 'github', ok: true, counts: { prs: 1, apiCalls: 1 }, startedAt: minutesAgo(85) });

    const res = await request(baseUrl).get('/api/sync/status');
    expect(res.body.health.jira.stale).toBe(true);
    expect(res.body.health.jira.lastError).toBeNull();
    expect(res.body.health.github.stale).toBe(false);
  });

  it('el umbral usa settings.syncMinutes (p.ej. 5 min ⇒ 15 min de margen)', async () => {
    repo.syncMinutesValue = 5;
    repo.seed({ source: 'jira', ok: true, counts: { issues: 100 }, startedAt: minutesAgo(20) });
    repo.seed({ source: 'github', ok: true, counts: { prs: 1, apiCalls: 1 }, startedAt: minutesAgo(10) });

    const res = await request(baseUrl).get('/api/sync/status');
    expect(res.body.health.jira.stale).toBe(true);
    expect(res.body.health.github.stale).toBe(false);
  });

  it('sin fila de settings ⇒ por defecto 30 min (90 de margen)', async () => {
    repo.syncMinutesValue = null;
    repo.seed({ source: 'jira', ok: true, counts: { issues: 100 }, startedAt: minutesAgo(60) });
    repo.seed({ source: 'github', ok: true, counts: { prs: 1, apiCalls: 1 }, startedAt: minutesAgo(60) });

    const res = await request(baseUrl).get('/api/sync/status');
    expect(res.body.health.jira.stale).toBe(false);
    expect(res.body.health.github.stale).toBe(false);
  });
});
