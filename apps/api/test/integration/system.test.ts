import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
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
vi.mock('../../src/db/client.js', () => ({
  getPool: vi.fn(),
  getDb: vi.fn(),
  pingDb: vi.fn().mockResolvedValue(true),
  closeDb: vi.fn(),
}));

const { getMetricsContext } = await import('../../src/domain/context.js');
const { bootstrap } = await import('@expressots/core');
const { App } = await import('../../src/app.js');

const NOW = new Date('2026-02-01T00:00:00Z');
const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const SYSTEM = {
  settings: { deployWorkflow: 'Deploy', deployBranches: '^main$|hotfix', featureBase: 'develop' },
  runs: [
    { id: 1, repo: 'org/app', name: 'Deploy', headBranch: 'main', conclusion: 'success', createdAt: at(48) },
    { id: 2, repo: 'org/app', name: 'Deploy', headBranch: 'main', conclusion: 'failure', createdAt: at(24) },
  ],
  prs: [
    {
      id: 'org/app#1',
      repo: 'org/app',
      author: 'alice',
      isBot: false,
      baseRef: 'main',
      firstCommitAt: null,
      createdAt: at(72),
      mergedAt: at(50),
      additions: 10,
      deletions: 2,
      reviews: [],
    },
  ],
  issues: [
    {
      key: 'ERF-1',
      createdAt: at(200),
      resolvedAt: at(10),
      deliveredAt: null,
      segments: [{ status: 'En curso', startedAt: at(100), endedAt: at(52) }],
    },
  ],
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  vi.mocked(getMetricsContext).mockResolvedValue({ now: NOW, system: SYSTEM } as never);
  const instance = await bootstrap(App, { port: 0 });
  server = await instance.getHttpServer();
  const port = await instance.getPort();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server?.close();
});

describe('GET /api/system', () => {
  it('returns the Sistema shape with DORA numbers', async () => {
    const res = await request(baseUrl).get('/api/system?months=3');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['batches', 'definitions', 'flow', 'practice', 'repos', 'window']);
    expect(res.body.repos).toHaveLength(1);
    expect(res.body.repos[0].repo).toBe('org/app');
    expect(res.body.repos[0].deploys).toBe(1); // solo success
    expect(res.body.repos[0].mergeToProdH).toBe(2);
    expect(res.body.repos[0].cfr).toBe(0.5);
    expect(res.body.flow.tickets).toBe(1);
    expect(res.body.flow.engineeringH).toBe(48);
  });

  it('filters by repo', async () => {
    const res = await request(baseUrl).get('/api/system?repo=org/other');
    expect(res.status).toBe(200);
    expect(res.body.repos).toHaveLength(0);
  });
});
