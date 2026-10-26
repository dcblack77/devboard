import { describe, it, expect, vi } from 'vitest';
import { GithubSync } from '../../../src/integrations/github/sync.js';
import { GithubClient, GithubAuthError } from '../../../src/integrations/github/client.js';
import type { GithubRepo, PrUpsertInput, ReviewUpsertInput, ReviewRequestUpsertInput } from '../../../src/integrations/github/repo.js';
import prMerged from './fixtures/pr-merged.json' with { type: 'json' };

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function viewerResponse() {
  return jsonResponse({ data: { viewer: { login: 'devboard-bot' } } });
}

function isViewerQuery(init?: RequestInit): boolean {
  return String(init?.body ?? '').includes('query { viewer { login } }');
}

function searchResponse(nodes: unknown[]) {
  return jsonResponse({
    data: {
      search: { issueCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes },
      rateLimit: { remaining: 5000, resetAt: new Date(Date.now() + 3600_000).toISOString() },
    },
  });
}

class InMemoryRepo implements GithubRepo {
  prs: PrUpsertInput[] = [];
  reviewsByPr = new Map<string, ReviewUpsertInput[]>();
  requestsByPr = new Map<string, ReviewRequestUpsertInput[]>();

  async upsertPrs(items: PrUpsertInput[]): Promise<void> {
    this.prs.push(...items);
  }
  async replaceReviews(prId: string, reviews: ReviewUpsertInput[]): Promise<void> {
    this.reviewsByPr.set(prId, reviews);
  }
  async replaceRequests(prId: string, requests: ReviewRequestUpsertInput[]): Promise<void> {
    this.requestsByPr.set(prId, requests);
  }
}

describe('GithubSync.run', () => {
  it('primera carga (sin lastFetchedAt previo): fetch por meses, upsert PRs + reviews + requests', async () => {
    let call = 0;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (isViewerQuery(init)) return viewerResponse();
      call += 1;
      // el PR "existe" solo en el mes de su created_at (enero); el resto de meses no devuelve nada
      return call === 1 ? searchResponse([prMerged]) : searchResponse([]);
    }) as unknown as typeof fetch;
    const repo = new InMemoryRepo();

    const sync = new GithubSync({
      settings: { org: 'acme', repos: ['svc-a'], since: new Date('2025-01-01T00:00:00Z'), issueKeyRegex: /\bPROJ-\d+\b/gi },
      token: 'fake-token',
      repo,
      lastSync: { lastOkFinishedAt: async () => null },
      clientFactory: (config) => new GithubClient({ ...config, fetchImpl: fetchMock, now: () => new Date('2025-03-01T00:00:00Z') }),
    });

    const result = await sync.run();

    expect(repo.prs).toHaveLength(1);
    expect(repo.prs[0].id).toBe('svc-a#101');
    expect(repo.reviewsByPr.get('svc-a#101')).toHaveLength(1);
    expect(repo.requestsByPr.get('svc-a#101')).toHaveLength(1);
    expect(result.counts.prs).toBe(1);
    expect(result.counts.reviews).toBe(1);
    expect(result.counts.repos).toBe(1);
    expect(result.counts.apiCalls).toBeGreaterThan(0);
    // primera carga: > 1 llamada porque parte por meses (ene, feb, mar)
    expect(result.counts.apiCalls).toBeGreaterThanOrEqual(3);
  });

  it('carga incremental: usa lastOkFinishedAt como lastFetchedAt (una sola query)', async () => {
    const queries: string[] = [];
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (isViewerQuery(init)) return viewerResponse();
      const body = JSON.parse(String(init?.body));
      queries.push(body.variables.q as string);
      return searchResponse([]);
    }) as unknown as typeof fetch;
    const repo = new InMemoryRepo();

    const sync = new GithubSync({
      settings: { org: 'acme', repos: ['svc-a'], since: new Date('2025-01-01T00:00:00Z') },
      token: 'fake-token',
      repo,
      lastSync: { lastOkFinishedAt: async () => new Date('2025-03-05T00:00:00Z') },
      clientFactory: (config) => new GithubClient({ ...config, fetchImpl: fetchMock }),
    });

    const result = await sync.run();

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('updated:>=2025-03-04');
    expect(result.counts.prs).toBe(0);
    // solo la búsqueda: la sonda viewer no cuenta
    expect(result.counts.apiCalls).toBe(1);
  });

  it('varios repos: agrega counts de todos', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      isViewerQuery(init) ? viewerResponse() : searchResponse([]),
    ) as unknown as typeof fetch;
    const repo = new InMemoryRepo();

    const sync = new GithubSync({
      settings: { org: 'acme', repos: ['svc-a', 'svc-b'], since: new Date('2025-01-01T00:00:00Z') },
      token: 'fake-token',
      repo,
      lastSync: { lastOkFinishedAt: async () => new Date('2025-03-05T00:00:00Z') },
      clientFactory: (config) => new GithubClient({ ...config, fetchImpl: fetchMock }),
    });

    const result = await sync.run();
    expect(result.counts.repos).toBe(2);
    // 1 búsqueda por repo; la sonda viewer no cuenta
    expect(result.counts.apiCalls).toBe(2);
  });

  it('sin repos configurados: apiCalls=0 aunque la sonda viewer sí se envió', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      isViewerQuery(init) ? viewerResponse() : searchResponse([]),
    ) as unknown as typeof fetch;
    const repo = new InMemoryRepo();

    const sync = new GithubSync({
      settings: { org: 'acme', repos: [], since: new Date('2025-01-01T00:00:00Z') },
      token: 'fake-token',
      repo,
      lastSync: { lastOkFinishedAt: async () => new Date('2025-03-05T00:00:00Z') },
      clientFactory: (config) => new GithubClient({ ...config, fetchImpl: fetchMock }),
    });

    const result = await sync.run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.counts.apiCalls).toBe(0);
  });

  it('token revocado (401 en viewer): run() rechaza con GithubAuthError y no toca el repo', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (isViewerQuery(init)) return new Response('{"message":"Bad credentials"}', { status: 401 });
      return searchResponse([prMerged]);
    }) as unknown as typeof fetch;
    const repo = new InMemoryRepo();

    const sync = new GithubSync({
      settings: { org: 'acme', repos: ['svc-a'], since: new Date('2025-01-01T00:00:00Z') },
      token: 'revoked',
      repo,
      lastSync: { lastOkFinishedAt: async () => null },
      clientFactory: (config) => new GithubClient({ ...config, fetchImpl: fetchMock }),
    });

    await expect(sync.run()).rejects.toBeInstanceOf(GithubAuthError);
    expect(repo.prs).toHaveLength(0);
    // solo la sonda; nunca se llegó a buscar PRs
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
