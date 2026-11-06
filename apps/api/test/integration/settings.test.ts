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
  jiraBoards: [
    { key: 'PROJ', kind: 'dev', name: null },
    { key: 'SUP', kind: 'support', name: 'Soporte' },
  ],
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
  deployWorkflow: 'Deployment',
  deployBranches: '^main$|hotfix',
  ciWorkflowRegex: '^CI',
  featureBase: 'develop',
  supportTechStatus: 'Escalated',
  supportSla: { High: { firstResponseHours: 4, resolutionHours: 24 } },
};

/** Captura el objeto pasado a `db.update(settings).set(...)`. */
const updateSpy = vi.fn();

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
    update: () => ({
      set: (values: unknown) => {
        updateSpy(values);
        return { where: () => Promise.resolve([]) };
      },
    }),
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
    expect(res.body.settings.jiraBoards).toEqual([
      { key: 'PROJ', kind: 'dev', name: null },
      { key: 'SUP', kind: 'support', name: 'Soporte' },
    ]);
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

  it('GET /api/settings expone los ajustes de Sistema con sus valores por defecto', async () => {
    const agent = request.agent(baseUrl);
    await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    const res = await agent.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({
      deployWorkflow: 'Deployment',
      deployBranches: '^main$|hotfix',
      ciWorkflowRegex: '^CI',
      featureBase: 'develop',
    });
  });

  it('PUT /api/settings con regex inválida en deployBranches responde 400', async () => {
    const agent = request.agent(baseUrl);
    await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    const res = await agent.put('/api/settings').send({ deployBranches: '(' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Payload inválido');
  });

  it('PUT /api/settings con regex inválida en ciWorkflowRegex responde 400', async () => {
    const agent = request.agent(baseUrl);
    await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    const res = await agent.put('/api/settings').send({ ciWorkflowRegex: '[' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/settings con ajustes de Sistema válidos responde 200', async () => {
    const agent = request.agent(baseUrl);
    await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    const res = await agent
      .put('/api/settings')
      .send({ deployWorkflow: 'Deploy prod', deployBranches: '^(main|release/.*)$', ciWorkflowRegex: '^(CI|Tests)', featureBase: 'dev' });
    expect(res.status).toBe(200);
  });

  it('GET /api/settings/discover sin sesión responde 401', async () => {
    const res = await request(baseUrl).get('/api/settings/discover');
    expect(res.status).toBe(401);
  });
});

describe('/api/settings — tableros de Jira (lista dev/support)', () => {
  async function tlAgent() {
    const agent = request.agent(baseUrl);
    await agent.post('/api/auth/login').send({ password: process.env.TL_PASSWORD });
    return agent;
  }

  it('GET devuelve la lista de tableros y los campos de soporte globales', async () => {
    const agent = await tlAgent();
    const res = await agent.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({
      jiraBoards: [{ key: 'PROJ', kind: 'dev' }, { key: 'SUP', kind: 'support' }],
      supportTechStatus: 'Escalated',
      supportSla: { High: { firstResponseHours: 4, resolutionHours: 24 } },
    });
    expect(res.body.settings).not.toHaveProperty('jiraProject');
    expect(res.body.settings).not.toHaveProperty('supportProject');
  });

  it('PUT jiraBoards normaliza clave (trim + mayúsculas) y nombre ("" -> null)', async () => {
    updateSpy.mockClear();
    const agent = await tlAgent();
    const res = await agent.put('/api/settings').send({
      jiraBoards: [
        { key: ' main ', kind: 'dev', name: '  Producto  ' },
        { key: 'sup', kind: 'support', name: '   ' },
        { key: 'ops', kind: 'dev' },
      ],
    });
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jiraBoards: [
          { key: 'MAIN', kind: 'dev', name: 'Producto' },
          { key: 'SUP', kind: 'support', name: null },
          { key: 'OPS', kind: 'dev', name: null },
        ],
      }),
    );
  });

  it('PUT jiraBoards vacío está permitido', async () => {
    updateSpy.mockClear();
    const agent = await tlAgent();
    const res = await agent.put('/api/settings').send({ jiraBoards: [] });
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ jiraBoards: [] }));
  });

  it('PUT supportTechStatus "" se guarda como null', async () => {
    updateSpy.mockClear();
    const agent = await tlAgent();
    const res = await agent.put('/api/settings').send({ supportTechStatus: '' });
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ supportTechStatus: null }));
  });

  it('PUT jiraBoards con claves duplicadas (tras normalizar) responde 400', async () => {
    updateSpy.mockClear();
    const agent = await tlAgent();
    const res = await agent.put('/api/settings').send({
      jiraBoards: [
        { key: 'MAIN', kind: 'dev' },
        { key: ' main', kind: 'support' },
      ],
    });
    expect(res.status).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('PUT jiraBoards con tipo desconocido responde 400', async () => {
    const agent = await tlAgent();
    const res = await agent.put('/api/settings').send({ jiraBoards: [{ key: 'MAIN', kind: 'ops' }] });
    expect(res.status).toBe(400);
  });

  it('PUT jiraBoards con clave inválida responde 400', async () => {
    const agent = await tlAgent();
    for (const key of ['1abc', 's up!', 'A', '']) {
      const res = await agent.put('/api/settings').send({ jiraBoards: [{ key, kind: 'dev' }] });
      expect(res.status, key).toBe(400);
    }
  });

  it('PUT jiraBoards con nombre de más de 40 caracteres responde 400', async () => {
    const agent = await tlAgent();
    const res = await agent.put('/api/settings').send({ jiraBoards: [{ key: 'MAIN', kind: 'dev', name: 'x'.repeat(41) }] });
    expect(res.status).toBe(400);
  });

  it('PUT jiraBoards con más de 10 tableros responde 400', async () => {
    const agent = await tlAgent();
    const boards = Array.from({ length: 11 }, (_, i) => ({ key: `B${i}X`, kind: 'dev' }));
    const res = await agent.put('/api/settings').send({ jiraBoards: boards });
    expect(res.status).toBe(400);
    const ok = await agent.put('/api/settings').send({ jiraBoards: boards.slice(0, 10) });
    expect(ok.status).toBe(200);
  });

  it('los campos antiguos jiraProject/supportProject ya no se guardan', async () => {
    updateSpy.mockClear();
    const agent = await tlAgent();
    const res = await agent.put('/api/settings').send({ jiraProject: 'MAIN', supportProject: 'SUP', attentionDays: 6 });
    expect(res.status).toBe(200);
    const saved = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(saved).not.toHaveProperty('jiraProject');
    expect(saved).not.toHaveProperty('supportProject');
  });

  it('PUT supportSla con horas negativas responde 400', async () => {
    const agent = await tlAgent();
    const res = await agent.put('/api/settings').send({ supportSla: { High: { firstResponseHours: -1 } } });
    expect(res.status).toBe(400);
  });

  it('PUT supportSla válido responde 200 y lo persiste', async () => {
    updateSpy.mockClear();
    const agent = await tlAgent();
    const sla = { High: { firstResponseHours: 2, resolutionHours: 8 }, Low: { resolutionHours: 72 } };
    const res = await agent.put('/api/settings').send({ supportSla: sla });
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ supportSla: sla }));
  });
});
