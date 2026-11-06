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
  jiraProject: 'MAIN',
  supportProject: 'SUP',
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
  it('returns configured:false only when no support project is set', async () => {
    vi.mocked(getMetricsContext).mockResolvedValue({ now: NOW, settings: { ...BASE_SETTINGS, supportProject: null } } as never);
    const res = await request(baseUrl).get('/api/support');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: false });
    expect(loadSupportTickets).not.toHaveBeenCalled();
  });

  it('returns the support summary shape for the configured project', async () => {
    vi.mocked(getMetricsContext).mockResolvedValue({ now: NOW, settings: BASE_SETTINGS } as never);
    const res = await request(baseUrl).get('/api/support?months=6');
    expect(res.status).toBe(200);
    expect(loadSupportTickets).toHaveBeenCalledWith('SUP');
    expect(Object.keys(res.body).sort()).toEqual(
      ['aging', 'byLabel', 'byPriority', 'byType', 'configured', 'definitions', 'open', 'project', 'sla', 'times', 'totals', 'weekly', 'window'].sort(),
    );
    expect(res.body.configured).toBe(true);
    expect(res.body.project).toBe('SUP');
    expect(res.body.totals.received).toBe(2);
    expect(res.body.totals.linkedToMainPct).toBe(0.5);
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
});
