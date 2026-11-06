import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';

process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/devboard_test';
process.env.SESSION_SECRET ??= 'test-secret-at-least-16-chars';
process.env.TL_PASSWORD ??= 'test-tl-password';
process.env.NODE_ENV = 'test';

vi.mock('../../src/domain/context.js', () => ({
  getMetricsContext: vi.fn(),
  invalidateMetricsContext: vi.fn(),
}));
vi.mock('../../src/modules/support/support.reader.js', () => ({ loadSupportTickets: vi.fn() }));
vi.mock('../../src/jobs/scheduler.js', () => ({ startScheduler: vi.fn() }));
vi.mock('../../src/modules/sync/register-sources.js', () => ({ registerRealSources: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/db/client.js', () => ({
  getPool: vi.fn(),
  getDb: vi.fn(),
  pingDb: vi.fn().mockResolvedValue(true),
  closeDb: vi.fn(),
}));

const { getMetricsContext } = await import('../../src/domain/context.js');
const { loadSupportTickets } = await import('../../src/modules/support/support.reader.js');
const { bootstrap } = await import('@expressots/core');
const { App } = await import('../../src/app.js');

/**
 * GET /api/support · `tickets`: fechas por ticket (creación/resolución) del tablero
 * seleccionado, para la gráfica configurable de Incidencias. Independiente de `months`.
 */
const NOW = new Date('2026-07-01T00:00:00Z');

const SETTINGS = {
  jiraBoards: [
    { key: 'MAIN', kind: 'dev', name: null },
    { key: 'SUP', kind: 'support', name: 'Soporte' },
    { key: 'HELP', kind: 'support', name: null },
  ],
  supportTechStatus: null,
  supportSla: {},
  statusAliases: {},
  statusFlow: ['To Do', 'Done'],
};

const base = { summary: 's', type: 'Bug', status: 'To Do', labels: [], linkedKeys: [], statusChanges: [] };
const TICKETS = [
  { ...base, key: 'SUP-1', priority: 'High', createdAt: new Date('2026-06-20T10:00:00Z'), resolvedAt: new Date('2026-06-22T10:00:00Z') },
  // ~2 años: fuera de cualquier ventana de `months`.
  { ...base, key: 'SUP-2', priority: null, createdAt: new Date('2024-05-01T00:00:00Z'), resolvedAt: null },
  { ...base, key: 'HELP-1', priority: 'Low', createdAt: new Date('2026-06-25T00:00:00Z'), resolvedAt: null },
];

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

beforeEach(() => {
  vi.mocked(getMetricsContext).mockResolvedValue({ now: NOW, settings: SETTINGS } as never);
  vi.mocked(loadSupportTickets).mockReset();
  vi.mocked(loadSupportTickets).mockResolvedValue(TICKETS as never);
});

type T = { key: string; created: string; resolved: string | null; priority: string | null };

describe('GET /api/support · tickets', () => {
  it('ALL: todos los tickets de soporte con fechas ISO, ordenados por creación', async () => {
    const res = await request(baseUrl).get('/api/support?months=3');
    expect(res.status).toBe(200);
    expect(res.body.tickets).toEqual([
      { key: 'SUP-2', created: '2024-05-01T00:00:00.000Z', resolved: null, priority: null },
      { key: 'SUP-1', created: '2026-06-20T10:00:00.000Z', resolved: '2026-06-22T10:00:00.000Z', priority: 'High' },
      { key: 'HELP-1', created: '2026-06-25T00:00:00.000Z', resolved: null, priority: 'Low' },
    ]);
  });

  it('board=SUP: solo los tickets de ese tablero', async () => {
    const res = await request(baseUrl).get('/api/support?months=12&board=SUP');
    expect(res.status).toBe(200);
    expect((res.body.tickets as T[]).map((t) => t.key)).toEqual(['SUP-2', 'SUP-1']);
  });

  it('months no recorta tickets (sí los KPIs)', async () => {
    const r3 = await request(baseUrl).get('/api/support?months=3');
    const r12 = await request(baseUrl).get('/api/support?months=12');
    expect((r3.body.tickets as T[]).length).toBe(3);
    expect((r12.body.tickets as T[]).length).toBe(3);
    expect(r3.body.totals.received).toBe(2);
  });

  it('mantiene los campos existentes (weekly incluido)', async () => {
    const res = await request(baseUrl).get('/api/support');
    for (const k of ['weekly', 'totals', 'times', 'byPriority', 'byLabel', 'byType', 'sla', 'aging', 'open', 'definitions', 'byBoard']) {
      expect(res.body, k).toHaveProperty(k);
    }
  });
});
