import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';

// Variables de entorno mínimas para que `loadEnv()` no falle al construir la app de test.
process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/devboard_test';
process.env.SESSION_SECRET ??= 'test-secret-at-least-16-chars';
process.env.TL_PASSWORD ??= 'test-tl-password';
process.env.NODE_ENV = 'test';

vi.mock('../../src/domain/context.js', () => ({
  getMetricsContext: vi.fn(),
  invalidateMetricsContext: vi.fn(),
}));
// El scheduler y el registro de fuentes reales no deben ejecutarse en el test de integración.
vi.mock('../../src/jobs/scheduler.js', () => ({ startScheduler: vi.fn() }));
vi.mock('../../src/modules/sync/register-sources.js', () => ({ registerRealSources: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/db/client.js', () => ({
  getPool: vi.fn(),
  getDb: vi.fn(),
  pingDb: vi.fn().mockResolvedValue(true),
  closeDb: vi.fn(),
}));

const { getMetricsContext } = await import('../../src/domain/context.js');
const { bootstrap } = await import('@expressots/core');
const { App } = await import('../../src/app.js');

const FAKE_HOME = {
  numbers: { open: 3, delivered: 5 },
  trend: null,
  rag: [],
  ragCounts: { green: 1, amber: 0, red: 0 },
};

function fakeContext(overrides: Record<string, unknown> = {}) {
  return {
    now: new Date('2026-02-01T00:00:00Z'),
    settings: { thresholds: { balanceRed: 0.5, balanceAmber: 0.8 } },
    issueSettings: { statusFlow: ['Backlog', 'Done'] },
    dstats: [
      {
        dev: 'Ana Pérez',
        slug: 'ana-perez',
        total: 1,
        open: 0,
        done: 1,
        throughput4w: 1,
        blockedNow: 0,
        attention: [],
        byType: { Historia: 1 },
        cycleMean: 24,
      },
    ],
    statusStats: [],
    daysByStateType: {},
    initiativesList: [],
    epicIndex: {},
    gh: null,
    rows: [],
    prs: [],
    home: FAKE_HOME,
    ...overrides,
  };
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  vi.mocked(getMetricsContext).mockResolvedValue(fakeContext() as never);
  const instance = await bootstrap(App, { port: 0 });
  server = await instance.getHttpServer();
  const port = await instance.getPort();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server?.close();
});

describe('endpoints de lectura (integración ligera, getMetricsContext mockeado)', () => {
  it('GET /api/home devuelve el resumen de portada sin sesión (viewer público)', async () => {
    const res = await request(baseUrl).get('/api/home');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(FAKE_HOME);
  });

  it('GET /api/jira expone estados y estadísticas', async () => {
    const res = await request(baseUrl).get('/api/jira');
    expect(res.status).toBe(200);
    expect(res.body.statuses).toEqual(['Backlog', 'Done']);
  });

  it('GET /api/team sin sesión responde 401 (requiere rol tl)', async () => {
    const res = await request(baseUrl).get('/api/team');
    expect(res.status).toBe(401);
  });

  it('login + GET /api/team con cookie tl responde 200 con ranking', async () => {
    const agent = request.agent(baseUrl);
    const login = await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe('tl');

    const res = await agent.get('/api/team');
    expect(res.status).toBe(200);
    expect(res.body.rank.rows).toHaveLength(1);
    expect(res.body.rank.rows[0].name).toBe('Ana Pérez');
  });
});
