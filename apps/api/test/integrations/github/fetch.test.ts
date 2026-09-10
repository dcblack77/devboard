import { describe, it, expect } from 'vitest';
import { monthRanges, fetchRepoPrs } from '../../../src/integrations/github/fetch.js';
import { GithubClient } from '../../../src/integrations/github/client.js';

describe('monthRanges', () => {
  it('divide un rango de meses en tramos [a, b) mensuales', () => {
    const since = new Date('2025-01-15T00:00:00Z');
    const until = new Date('2025-04-01T00:00:00Z');
    const ranges = monthRanges(since, until);

    expect(ranges).toHaveLength(3);
    expect(ranges[0][0].toISOString()).toBe('2025-01-15T00:00:00.000Z');
    expect(ranges[0][1].toISOString()).toBe('2025-02-01T00:00:00.000Z');
    expect(ranges[1][0].toISOString()).toBe('2025-02-01T00:00:00.000Z');
    expect(ranges[1][1].toISOString()).toBe('2025-03-01T00:00:00.000Z');
    expect(ranges[2][0].toISOString()).toBe('2025-03-01T00:00:00.000Z');
    expect(ranges[2][1].toISOString()).toBe('2025-04-01T00:00:00.000Z');
  });

  it('un solo tramo si since y until caen en el mismo mes', () => {
    const since = new Date('2025-06-03T00:00:00Z');
    const until = new Date('2025-06-20T00:00:00Z');
    const ranges = monthRanges(since, until);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual([since, until]);
  });

  it('vacío si since >= until', () => {
    const d = new Date('2025-06-03T00:00:00Z');
    expect(monthRanges(d, d)).toEqual([]);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function emptyPage(remaining = 5000) {
  return jsonResponse({
    data: {
      search: { issueCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
      rateLimit: { remaining, resetAt: new Date(Date.now() + 3600_000).toISOString() },
    },
  });
}

describe('fetchRepoPrs', () => {
  it('primera carga (sin lastFetchedAt): parte por meses con un único qualifier created:', async () => {
    const queries: string[] = [];
    const fetchMock = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      queries.push(body.variables.q as string);
      return emptyPage();
    };
    const client = new GithubClient({
      token: 't',
      org: 'acme',
      repos: ['svc-a'],
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const since = new Date('2025-01-01T00:00:00Z');
    const now = new Date('2025-03-10T00:00:00Z');
    await fetchRepoPrs(client, { org: 'acme', repo: 'svc-a', since, now });

    expect(queries.length).toBeGreaterThanOrEqual(3);
    for (const q of queries) {
      // exactamente un qualifier created: (pitfall: dos created: hace que GitHub lo ignore)
      expect((q.match(/created:/g) ?? []).length).toBe(1);
      expect(q).not.toContain('updated:');
    }
  });

  it('carga incremental (con lastFetchedAt): un único query con updated:>= (menos 1 día)', async () => {
    const queries: string[] = [];
    const fetchMock = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      queries.push(body.variables.q as string);
      return emptyPage();
    };
    const client = new GithubClient({
      token: 't',
      org: 'acme',
      repos: ['svc-a'],
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const since = new Date('2025-01-01T00:00:00Z');
    const lastFetchedAt = new Date('2025-03-05T00:00:00Z');
    await fetchRepoPrs(client, { org: 'acme', repo: 'svc-a', since, lastFetchedAt });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('created:>=2025-01-01');
    expect(queries[0]).toContain('updated:>=2025-03-04'); // lastFetchedAt - 1 día
  });
});
