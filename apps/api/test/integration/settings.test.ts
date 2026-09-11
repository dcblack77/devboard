import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';

// Variables de entorno mínimas para que `loadEnv()` no falle al construir la app de test.
process.env.DATABASE_URL ??= 'postgres://user:***@localhost:5432/devboard_test';
process.env.SESSION_SECRET ??= 'test-secret-at-least-16-chars';
process.env.TL_PASSWORD ??= 'test-tl-password';
process.env.NODE_ENV = 'test';

const FAKE_SETTINGS = {
  id: 1,
  jiraProject: 'PROJ',
  sinceDate: null,
  syncMinutes: 30,
  attentionDays: 5,
  reviewDays: 2,
  waitReviewHours: 24,
  thresholds: {
    balanceRed: 0.5,
    balanceAmber: 0.8,
    responseGreenHours: 8,
    responseRedHours: 48,
    firstReviewGreenHours: 24,
    firstReviewRedHours: 48,
    noApprovalRed: 1,
    stalePrsRed: 3,
    blockedRed: 1,
  },
  statusFlow: ['Backlog', 'Done'],
  statusAliases: {},
  macroMap: {},
  countedTypes: ['Historia'],
  hotfixRegex: null,
};

vi.mock('../../src/domain/context.js', () => ({
  getMetricsContext: vi.fn().mockResolvedValue({ settings: FAKE_SETTINGS }),
  invalidateMetricsContext: vi.fn(),
}));
vi.mock('../../src/jobs/scheduler.js', () => ({ startScheduler: vi.fn() }));
vi.mock('../../src/modules/sync/register-sources.js', () => ({ registerRealSources: vi.fn().mockResolvedValue(undefined) }));

// `db/client.js` mockeado con un `getDb()` que soporta la cadena fluida usada por el
// controlador (`update(...).set(...).where(...)`); no ejercitamos Postgres real aquí.
vi.mock('../../src/db/client.js', () => ({
  getPool: vi.fn(),
  getDb: vi.fn(() => ({
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    select: () => ({ from: () => Promise.resolve([]) }),
  })),
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
  const port = await instance.getPort();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server?.close();
});

describe('/api/settings — autenticación y validación', () => {
  it('GET /api/settings sin sesión responde 401 (requiere rol tl)', async () => {
    const res = await request(baseUrl).get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('login tl + GET /api/settings responde 200 con el DTO', async () => {
    const agent = request.agent(baseUrl);
    await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    const res = await agent.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.jiraProject).toBe('PROJ');
  });

  it('PUT /api/settings con payload inválido (tipo incorrecto) responde 400', async () => {
    const agent = request.agent(baseUrl);
    await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    const res = await agent.put('/api/settings').send({ syncMinutes: 'no-es-un-numero' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payload inválido');
  });

  it('PUT /api/settings con umbrales incompletos responde 400', async () => {
    const agent = request.agent(baseUrl);
    await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    const res = await agent.put('/api/settings').send({ thresholds: { balanceRed: 0.5 } });
    expect(res.status).toBe(400);
  });

  it('PUT /api/settings con payload válido responde 200', async () => {
    const agent = request.agent(baseUrl);
    await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    const res = await agent.put('/api/settings').send({ attentionDays: 7 });
    expect(res.status).toBe(200);
  });

  it('GET /api/settings/discover sin sesión responde 401', async () => {
    const res = await request(baseUrl).get('/api/settings/discover');
    expect(res.status).toBe(401);
  });
});
