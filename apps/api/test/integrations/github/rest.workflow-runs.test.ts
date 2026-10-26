import { describe, it, expect, vi } from 'vitest';
import { GithubClient, GithubAuthError } from '../../../src/integrations/github/client.js';
import { listWorkflowRuns } from '../../../src/integrations/github/rest.js';
import type { WorkflowRunApi } from '../../../src/integrations/github/types.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeRun(id: number): WorkflowRunApi {
  return {
    id,
    name: id % 2 === 0 ? 'Deployment' : 'CI',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    head_sha: `sha-${id}`,
    run_attempt: 1,
    created_at: '2025-03-01T10:00:00Z',
    run_started_at: '2025-03-01T10:00:05Z',
    updated_at: '2025-03-01T10:05:00Z',
  };
}

function client(fetchImpl: typeof fetch) {
  return new GithubClient({ token: 'tok', org: 'acme', repos: ['svc-a'], fetchImpl, maxRetries: 1, sleepImpl: async () => {} });
}

describe('listWorkflowRuns (REST /actions/runs)', () => {
  it('pagina de 100 en 100 hasta la página corta: 100 + 100 + 3 = 203 filas, 3 llamadas contadas en apiCalls', async () => {
    const urls: string[] = [];
    const total = 203;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      urls.push(u.toString());
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      expect((init?.headers as Record<string, string>).Accept).toBe('application/vnd.github+json');
      expect((init?.headers as Record<string, string>)['X-GitHub-Api-Version']).toBe('2022-11-28');
      const page = Number(u.searchParams.get('page'));
      const start = (page - 1) * 100;
      const runs = Array.from({ length: Math.max(0, Math.min(100, total - start)) }, (_, i) => fakeRun(start + i + 1));
      return jsonResponse({ total_count: total, workflow_runs: runs });
    }) as unknown as typeof fetch;

    const c = client(fetchMock);
    const rows = await listWorkflowRuns(c, 'svc-a', { createdSince: new Date('2025-02-14T13:45:00Z') });

    expect(rows).toHaveLength(203);
    expect(rows[0].id).toBe(1);
    expect(rows[202].id).toBe(203);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(c.apiCalls).toBe(3);
    // formato del filtro: created=>=YYYY-MM-DD, per_page=100, page=n, sobre /repos/{org}/{repo}/actions/runs
    const first = new URL(urls[0]);
    expect(first.pathname).toBe('/repos/acme/svc-a/actions/runs');
    expect(first.searchParams.get('created')).toBe('>=2025-02-14');
    expect(first.searchParams.get('per_page')).toBe('100');
    expect(first.searchParams.get('page')).toBe('1');
    expect(new URL(urls[2]).searchParams.get('page')).toBe('3');
  });

  it('corta cuando se alcanza total_count aunque la página venga llena (100 exactas ⇒ 1 llamada)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ total_count: 100, workflow_runs: Array.from({ length: 100 }, (_, i) => fakeRun(i + 1)) }),
    ) as unknown as typeof fetch;
    const rows = await listWorkflowRuns(client(fetchMock), 'svc-a', { createdSince: new Date('2025-01-01T00:00:00Z') });
    expect(rows).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin runs: lista vacía, 1 llamada', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ total_count: 0, workflow_runs: [] })) as unknown as typeof fetch;
    const rows = await listWorkflowRuns(client(fetchMock), 'svc-a', { createdSince: new Date('2025-01-01T00:00:00Z') });
    expect(rows).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401 ⇒ GithubAuthError', async () => {
    const fetchMock = vi.fn(async () => new Response('{"message":"Bad credentials"}', { status: 401 })) as unknown as typeof fetch;
    await expect(
      listWorkflowRuns(client(fetchMock), 'svc-a', { createdSince: new Date('2025-01-01T00:00:00Z') }),
    ).rejects.toBeInstanceOf(GithubAuthError);
  });
});
