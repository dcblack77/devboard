import { describe, it, expect, vi } from 'vitest';
import { GithubClient, GithubApiError } from '../../../src/integrations/github/client.js';
import prMerged from './fixtures/pr-merged.json' with { type: 'json' };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function searchResponse(nodes: unknown[], hasNextPage: boolean, endCursor: string | null, remaining = 5000) {
  return jsonResponse({
    data: {
      search: { issueCount: nodes.length, pageInfo: { hasNextPage, endCursor }, nodes },
      rateLimit: { remaining, resetAt: new Date(Date.now() + 3600_000).toISOString() },
    },
  });
}

describe('GithubClient.searchPullRequests pagination', () => {
  it('pagina con pageInfo.endCursor hasta hasNextPage=false', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body.variables);
      if (!body.variables.after) {
        return searchResponse([prMerged], true, 'cursor-1');
      }
      return searchResponse([], false, null);
    }) as unknown as typeof fetch;

    const client = new GithubClient({ token: 't', org: 'acme', repos: ['svc-a'], fetchImpl: fetchMock });
    const nodes = [];
    for await (const n of client.searchPullRequests('repo:acme/svc-a is:pr')) nodes.push(n);

    expect(nodes).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].after).toBeNull();
    expect(calls[1].after).toBe('cursor-1');
  });

  it('reintenta en 502/503/504 y termina en éxito', async () => {
    let attempt = 0;
    const sleeps: number[] = [];
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      if (attempt <= 2) return jsonResponse('bad gateway', 502);
      return searchResponse([], false, null);
    }) as unknown as typeof fetch;

    const client = new GithubClient({
      token: 't',
      org: 'acme',
      repos: ['svc-a'],
      fetchImpl: fetchMock,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });

    const nodes = [];
    for await (const n of client.searchPullRequests('repo:acme/svc-a is:pr')) nodes.push(n);

    expect(attempt).toBe(3);
    expect(sleeps).toEqual([2000, 5000]);
  });

  it('lanza GithubApiError tras agotar reintentos', async () => {
    const fetchMock = vi.fn(async () => jsonResponse('bad gateway', 503)) as unknown as typeof fetch;
    const client = new GithubClient({
      token: 't',
      org: 'acme',
      repos: ['svc-a'],
      maxRetries: 2,
      fetchImpl: fetchMock,
      sleepImpl: async () => {},
    });

    await expect(async () => {
      for await (const _n of client.searchPullRequests('repo:acme/svc-a is:pr')) {
        // no-op
      }
    }).rejects.toThrow(GithubApiError);
  });

  it('duerme hasta resetAt cuando rateLimit.remaining < 50', async () => {
    const resetAt = new Date('2025-01-01T01:00:00Z');
    const now = new Date('2025-01-01T00:00:00Z');
    const sleeps: number[] = [];
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse({
          data: {
            search: { issueCount: 0, pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [] },
            rateLimit: { remaining: 10, resetAt: resetAt.toISOString() },
          },
        });
      }
      return searchResponse([], false, null);
    }) as unknown as typeof fetch;

    const client = new GithubClient({
      token: 't',
      org: 'acme',
      repos: ['svc-a'],
      fetchImpl: fetchMock,
      now: () => now,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });

    const nodes = [];
    for await (const n of client.searchPullRequests('repo:acme/svc-a is:pr')) nodes.push(n);

    expect(sleeps).toEqual([60 * 60 * 1000]);
  });

  it('cuenta las peticiones GraphQL realizadas en apiCalls', async () => {
    const fetchMock = vi.fn(async () => searchResponse([], false, null)) as unknown as typeof fetch;
    const client = new GithubClient({ token: 't', org: 'acme', repos: ['svc-a'], fetchImpl: fetchMock });
    const nodes = [];
    for await (const n of client.searchPullRequests('repo:acme/svc-a is:pr')) nodes.push(n);
    expect(client.apiCalls).toBe(1);
  });
});
