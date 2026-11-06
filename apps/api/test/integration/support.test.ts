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

const NOW = new Date('2026-07-01T00:00:00Z');
const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const BASE_SETTINGS = {
  jiraBoards: [
    { key: 'MAIN', kind: 'dev', name: null },
    { key: 'SUP', kind: 'support', name: 'Soporte' },
  ],
  supportTechStatus: 'Escalated',
  supportSla: { High: { resolutionHours: 24 } },
  statusAliases: { 'Por hacer': 'To Do' },
  statusFlow: ['To Do', 'In Progress', 'Done'],
};

const TICKETS = [
  {
    key: 'SUP-1',
    summary: 'cannot log in',
    type: 'Bug',
    status: 'Done',
    priority: 'High',
    labels: ['login'],
    createdAt: at(100),
    resolvedAt: at(90),
    linkedKeys: ['MAIN-7'],
    statusChanges: [{ at: at(98), from: 'Por hacer', to: 'Done' }],
  },
  {
    key: 'SUP-2',
    summary: 'old ticket',
    type: 'Task',
    status: 'Escalated',
    priority: 'High',
    labels: [],
    createdAt: at(24 * 120), // ~4 meses
    resolvedAt: null,
    linkedKeys: [],
    statusChanges: [{ at: at(24 * 119), from: 'To Do', to: 'Escalated' }],
  },
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
  vi.mocked(loadSupportTickets).mockReset();
  vi.mocked(loadSupportTickets).mockResolvedValue(TICKETS as never);
});

describe('GET /api/support', () => {
  it('returns configured:false only when there are no support boards', async () => {
    vi.mocked(getMetricsContext).mockResolvedValue({ now: NOW, settings: { ...BASE_SETTINGS, jiraBoards: [{ key: 'MAIN', kind: 'dev' }] } } as never);
    const res = await request(baseUrl).get('/api/support');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: false });
    expect(loadSupportTickets).not.toHaveBeenCalled();
  });

  it('returns the support summary shape for the configured project', async () => {
    vi.mocked(getMetricsContext).mockResolvedValue({ now: NOW, settings: BASE_SETTINGS } as never);
    const res = await request(baseUrl).get('/api/support?months=6');
    expect(res.status).toBe(200);
    expect(loadSupportTickets).toHaveBeenCalledWith(['SUP']);
    expect(Object.keys(res.body).sort()).toEqual(
      ['aging', 'boardNames', 'boards', 'byBoard', 'byLabel', 'byPriority', 'byType', 'configured', 'definitions', 'open', 'project', 'selectedBoard', 'sla', 'tickets', 'times', 'totals', 'weekly', 'window'].sort(),
    );
    expect(res.body.configured).toBe(true);
    expect(res.body.project).toBe('SUP'); // un solo tablero: Todos = ese tablero
    expect(res.body.selectedBoard).toBe('ALL');
    expect(res.body.boards).toEqual(['SUP']);
    expect(res.body.boardNames).toEqual({ SUP: 'Soporte' });
    expect(res.body.totals.received).toBe(2);
    expect(res.body.totals.linkedToDevPct).toBe(0.5);
    expect(res.body.totals.escalatedPct).toBe(0.5);
    expect(res.body.open[0]).toMatchObject({ key: 'SUP-2', escalated: true });
    expect(res.body.sla.breachedOpen).toHaveLength(1);
    const from = new Date(res.body.window.from);
    expect(from.getUTCMonth()).toBe(0); // julio - 6 meses = enero
  });

  it('months=3 narrows the cohort; invalid months falls back to 12', async () => {
    vi.mocked(getMetricsContext).mockResolvedValue({ now: NOW, settings: BASE_SETTINGS } as never);
    const r3 = await request(baseUrl).get('/api/support?months=3');
    expect(r3.body.totals.received).toBe(1);
    expect(r3.body.totals.openNow).toBe(1);
    const bad = await request(baseUrl).get('/api/support?months=5');
    expect(new Date(bad.body.window.from).getUTCFullYear()).toBe(2025);
  });

  describe('varios tableros de soporte', () => {
    const MULTI = {
      ...BASE_SETTINGS,
      jiraBoards: [
        { key: 'MAIN', kind: 'dev', name: null },
        { key: 'SUP', kind: 'support', name: 'Soporte' },
        { key: 'OPS', kind: 'dev', name: null },
        { key: 'HELP', kind: 'support', name: null },
      ],
    };
    const HELP_TICKETS = [
      {
        key: 'HELP-1',
        summary: 'printer',
        type: 'Task',
        status: 'To Do',
        priority: 'Low',
        labels: [],
        createdAt: at(10),
        resolvedAt: null,
        linkedKeys: ['OPS-3'],
        statusChanges: [],
      },
    ];

    beforeEach(() => {
      vi.mocked(getMetricsContext).mockResolvedValue({ now: NOW, settings: MULTI } as never);
      vi.mocked(loadSupportTickets).mockImplementation(async (projects: string[]) =>
        [...(projects.includes('SUP') ? TICKETS : []), ...(projects.includes('HELP') ? HELP_TICKETS : [])] as never,
      );
    });

    it('board=ALL (por defecto) agrega todos los tableros de soporte y devuelve byBoard', async () => {
      const res = await request(baseUrl).get('/api/support?months=12');
      expect(res.status).toBe(200);
      expect(loadSupportTickets).toHaveBeenCalledWith(['SUP', 'HELP']);
      expect(res.body.selectedBoard).toBe('ALL');
      expect(res.body.boards).toEqual(['SUP', 'HELP']);
      expect(res.body.project).toBeNull();
      expect(res.body.totals.received).toBe(3);
      // SUP-1 -> MAIN-7 y HELP-1 -> OPS-3: los dos tableros dev cuentan.
      expect(res.body.totals.linkedToDevPct).toBeCloseTo(2 / 3);
      expect(res.body.byBoard).toEqual([
        expect.objectContaining({ board: 'SUP', received: 2, resolved: 1, openNow: 1, escalatedPct: 0.5 }),
        expect.objectContaining({ board: 'HELP', received: 1, resolved: 0, openNow: 1, escalatedPct: 0 }),
      ]);
    });

    it('board=HELP filtra a ese tablero pero byBoard sigue cubriendo todos', async () => {
      const res = await request(baseUrl).get('/api/support?months=12&board=help');
      expect(res.status).toBe(200);
      expect(res.body.selectedBoard).toBe('HELP');
      expect(res.body.project).toBe('HELP');
      expect(res.body.totals.received).toBe(1);
      expect(res.body.open.map((o: { key: string }) => o.key)).toEqual(['HELP-1']);
      expect(res.body.byBoard.map((r: { board: string }) => r.board)).toEqual(['SUP', 'HELP']);
    });

    it('board que no es de soporte responde 400', async () => {
      for (const board of ['MAIN', 'NOPE']) {
        const res = await request(baseUrl).get(`/api/support?board=${board}`);
        expect(res.status, board).toBe(400);
      }
    });
  });
});
