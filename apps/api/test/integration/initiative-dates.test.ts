/**
 * Contrato HTTP de plazos/estimación: GET /api/initiatives, /api/initiatives/:slug y /api/home.
 *
 * Integración de punta a punta salvo Postgres: el contexto de métricas REAL (`buildMetricsContext`)
 * lee filas de un fake de drizzle con las columnas nuevas de la migración 0009
 * (`epics.startDate/dueDate/resolvedAt`, `issues.dueDate/storyPoints`) y las URLs de Jira salen de
 * `JIRA_BASE_URL` (mismo helper que /api/links). "Hoy" = 12/03/2026 (Date falseado).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';

process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/devboard_test';
process.env.SESSION_SECRET ??= 'test-secret-at-least-16-chars';
process.env.TL_PASSWORD ??= 'test-tl-password';
process.env.JIRA_BASE_URL = 'https://example.atlassian.net/';
process.env.NODE_ENV = 'test';

vi.mock('../../src/jobs/scheduler.js', () => ({ startScheduler: vi.fn() }));
vi.mock('../../src/modules/sync/register-sources.js', () => ({ registerRealSources: vi.fn().mockResolvedValue(undefined) }));

const NOW = new Date('2026-03-12T10:00:00Z');
const BROWSE = 'https://example.atlassian.net/browse/';

const schema = await import('../../src/db/schema.js');

const SETTINGS = {
  id: 1,
  jiraBoards: [{ key: 'MAIN', kind: 'dev' }],
  sinceDate: null,
  syncMinutes: 30,
  attentionDays: 7,
  reviewDays: 3,
  waitReviewHours: 24,
  thresholds: {},
  statusFlow: ['Backlog', 'Por hacer', 'Bloqueada', 'En curso', 'En revisión', 'Entregada', 'Finalizada'],
  statusAliases: {},
  macroMap: {
    Backlog: 'pendiente',
    'Por hacer': 'pendiente',
    Bloqueada: 'bloqueada',
    'En curso': 'en_marcha',
    'En revisión': 'en_marcha',
    Entregada: 'entregada',
    Finalizada: 'cerrada',
  },
  countedTypes: ['Historia', 'Tarea', 'Error'],
  hotfixRegex: null,
  deployWorkflow: 'Deployment',
  deployBranches: '^main$|hotfix',
  ciWorkflowRegex: '^CI',
  featureBase: 'develop',
  supportTechStatus: null,
  supportSla: {},
};

const created = new Date('2026-01-02T09:00:00Z');

function issue(key: string, epicKey: string, status: string, over: Record<string, unknown> = {}) {
  const macro = (SETTINGS.macroMap as Record<string, string>)[status] ?? 'pendiente';
  return {
    key,
    summary: `Historia ${key}`,
    type: 'Historia',
    status,
    statusNorm: status,
    macro,
    assigneeRaw: null,
    personId: null,
    parentKey: epicKey,
    parentType: 'Epic',
    epicKey,
    createdAt: created,
    resolvedAt: macro === 'cerrada' ? new Date('2026-02-10T09:00:00Z') : null,
    updatedAt: created,
    raw: {},
    dueDate: null,
    storyPoints: null,
    ...over,
  };
}

function epic(key: string, over: Record<string, unknown> = {}) {
  return {
    key,
    summary: `Épica ${key}`,
    status: 'En curso',
    assigneeRaw: null,
    createdAt: new Date('2025-12-01T00:00:00Z'),
    startDate: null,
    dueDate: null,
    resolvedAt: null,
    ...over,
  };
}

const TABLES = new Map<unknown, unknown[]>([
  [schema.settings, [SETTINGS]],
  [schema.people, []],
  [
    schema.initiatives,
    [
      { id: 1, name: 'Pagos', slug: 'pagos', position: 0, source: 'auto', epicKey: 'MAIN-10' },
      { id: 2, name: 'Cobros', slug: 'cobros', position: 1, source: 'manual', epicKey: null },
      { id: 3, name: 'Sin fechas', slug: 'sin-fechas', position: 2, source: 'auto', epicKey: 'MAIN-30' },
    ],
  ],
  [
    schema.initiativeEpics,
    [
      { id: 1, initiativeId: 1, epicKey: 'MAIN-10' },
      { id: 2, initiativeId: 2, epicKey: 'MAIN-20' },
      { id: 3, initiativeId: 2, epicKey: 'MAIN-10' },
      { id: 4, initiativeId: 3, epicKey: 'MAIN-30' },
    ],
  ],
  [
    schema.issues,
    [
      issue('MAIN-11', 'MAIN-10', 'Finalizada', { storyPoints: 5 }),
      issue('MAIN-12', 'MAIN-10', 'En curso', { storyPoints: 3, dueDate: '2026-03-20' }),
      issue('MAIN-13', 'MAIN-10', 'Por hacer', { dueDate: '2026-03-25' }),
      issue('MAIN-14', 'MAIN-10', 'Por hacer'),
      issue('MAIN-31', 'MAIN-30', 'Por hacer'),
    ],
  ],
  [schema.issueStatusSegments, []],
  [
    schema.epics,
    [
      epic('MAIN-10', { startDate: '2026-01-01', dueDate: '2026-04-11' }),
      epic('MAIN-20', { startDate: '2026-02-01', dueDate: '2026-04-30' }),
      epic('MAIN-30'),
    ],
  ],
  [schema.pullRequests, []],
  [schema.prReviews, []],
  [schema.prReviewRequests, []],
  [schema.workflowRuns, []],
]);

/** Fake de lectura de drizzle: `select().from(t)[.where().limit() | .orderBy()]` → filas de `TABLES`. */
function fakeDb() {
  return {
    select: () => ({
      from: (t: unknown) => {
        const rows = TABLES.get(t);
        if (!rows) throw new Error('tabla no soportada en el fake');
        const copy = () => rows.map((r) => ({ ...(r as object) }));
        const p = Promise.resolve(copy());
        return Object.assign(p, {
          where: () => Object.assign(Promise.resolve(copy()), { limit: (n: number) => Promise.resolve(copy().slice(0, n)) }),
          orderBy: () => Promise.resolve(copy()),
        });
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

const { resetEnvForTests } = await import('../../src/config/env.js');
const { invalidateMetricsContext } = await import('../../src/domain/context.js');
const { bootstrap } = await import('@expressots/core');
const { App } = await import('../../src/app.js');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetEnvForTests();
  invalidateMetricsContext();
  const instance = await bootstrap(App, { port: 0 });
  server = await instance.getHttpServer();
  baseUrl = `http://127.0.0.1:${await instance.getPort()}`;
});

afterAll(() => {
  server?.close();
  vi.useRealTimers();
  invalidateMetricsContext();
});

const EST_MAIN_10 = { pointsOpen: 3, withPoints: 1, withDueOnly: 1, unestimated: 1, open: 3 };

describe('GET /api/initiatives — plazos y estimación', () => {
  it('cada iniciativa añade fechas, plazo, días, estimación y enlace a Jira; los campos existentes siguen', async () => {
    const res = await request(baseUrl).get('/api/initiatives');
    expect(res.status).toBe(200);
    const list = res.body.initiatives as Array<Record<string, unknown>>;
    expect(list.map((i) => i.slug)).toEqual(['pagos', 'cobros', 'sin-fechas']);

    const pagos = list[0]!;
    // existentes
    expect(pagos).toMatchObject({ name: 'Pagos', slug: 'pagos', childrenTotal: 4, pctDone: 25, rag: expect.objectContaining({ color: expect.any(String) }) });
    expect(pagos).toHaveProperty('people');
    expect(pagos).toHaveProperty('epics');
    // nuevos
    expect(pagos).toMatchObject({
      startDate: '2026-01-01',
      targetDate: '2026-04-11',
      closedAt: null,
      schedule: 'at_risk',
      closedLate: false,
      daysLeft: 30,
      jiraKey: 'MAIN-10',
      jiraUrl: `${BROWSE}MAIN-10`,
      estimation: EST_MAIN_10,
    });

    // varias épicas: inicio más temprano, fin más tardío, enlace de la primera épica
    expect(list[1]).toMatchObject({
      startDate: '2026-01-01',
      targetDate: '2026-04-30',
      schedule: 'on_track',
      daysLeft: 49,
      jiraKey: 'MAIN-20',
      jiraUrl: `${BROWSE}MAIN-20`,
      estimation: EST_MAIN_10,
    });

    expect(list[2]).toMatchObject({
      startDate: null,
      targetDate: null,
      schedule: 'no_dates',
      daysLeft: null,
      estimation: { pointsOpen: 0, withPoints: 0, withDueOnly: 0, unestimated: 1, open: 1 },
    });
  });
});

describe('GET /api/initiatives/:slug — detalle', () => {
  it('cabecera + epics[] con sus propios campos de plazo y jiraUrl', async () => {
    const res = await request(baseUrl).get('/api/initiatives/cobros');
    expect(res.status).toBe(200);
    const d = res.body.initiatives as Record<string, unknown> & { epics: Array<Record<string, unknown>> };
    expect(d).toMatchObject({ slug: 'cobros', schedule: 'on_track', jiraUrl: `${BROWSE}MAIN-20`, targetDate: '2026-04-30' });
    expect(d.epics.map((e) => e.key)).toEqual(['MAIN-20', 'MAIN-10']);
    expect(d.epics[0]).toMatchObject({
      key: 'MAIN-20',
      summary: 'Épica MAIN-20',
      status: 'En curso',
      startDate: '2026-02-01',
      targetDate: '2026-04-30',
      closedAt: null,
      schedule: expect.any(String),
      closedLate: false,
      daysLeft: 49,
      jiraUrl: `${BROWSE}MAIN-20`,
      estimation: { pointsOpen: 0, withPoints: 0, withDueOnly: 0, unestimated: 0, open: 0 },
    });
    expect(d.epics[1]).toMatchObject({ key: 'MAIN-10', schedule: 'at_risk', daysLeft: 30, jiraUrl: `${BROWSE}MAIN-10`, estimation: EST_MAIN_10 });
    expect(d.epics[1]).toHaveProperty('pctDone', 25);
  });

  it('issues[] llevan su estimación (storyPoints, dueDate) para la columna «Estimación»', async () => {
    const res = await request(baseUrl).get('/api/initiatives/pagos');
    const issues = res.body.initiatives.issues as Array<Record<string, unknown>>;
    const byKey = Object.fromEntries(issues.map((i) => [i.key, i]));
    expect(byKey['MAIN-12']).toMatchObject({ storyPoints: 3, dueDate: '2026-03-20' });
    expect(byKey['MAIN-13']).toMatchObject({ storyPoints: null, dueDate: '2026-03-25' });
    expect(byKey['MAIN-14']).toMatchObject({ storyPoints: null, dueDate: null });
  });

  it('404 sigue igual', async () => {
    const res = await request(baseUrl).get('/api/initiatives/no-existe');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/home — entradas rag con plazos', () => {
  it('añade fechas, plazo, días, enlace y estimación; mantiene ragCounts y campos previos', async () => {
    const res = await request(baseUrl).get('/api/home');
    expect(res.status).toBe(200);
    expect(res.body.ragCounts).toEqual({ green: expect.any(Number), amber: expect.any(Number), red: expect.any(Number) });
    expect(res.body).toHaveProperty('numbers');
    const rag = res.body.rag as Array<Record<string, unknown>>;
    expect(rag[0]).toMatchObject({
      name: 'Pagos',
      slug: 'pagos',
      pct: 25,
      color: expect.any(String),
      reason: expect.any(String),
      startDate: '2026-01-01',
      targetDate: '2026-04-11',
      schedule: 'at_risk',
      daysLeft: 30,
      jiraKey: 'MAIN-10',
      jiraUrl: `${BROWSE}MAIN-10`,
      estimation: EST_MAIN_10,
    });
    expect(rag[2]).toMatchObject({ slug: 'sin-fechas', schedule: 'no_dates', startDate: null, targetDate: null, daysLeft: null });
  });
});
