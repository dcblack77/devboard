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

/** Parsea `created=YYYY-MM-DD..YYYY-MM-DD` de la URL. */
function createdRange(url: string): { from: string; to: string; days: number } {
  const created = new URL(url).searchParams.get('created') ?? '';
  const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(created);
  if (!m) throw new Error(`created inesperado: ${created}`);
  const days = Math.round((Date.parse(m[2]) - Date.parse(m[1])) / 86_400_000) + 1;
  return { from: m[1], to: m[2], days };
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
    const rows = await listWorkflowRuns(c, 'svc-a', {
      createdSince: new Date('2025-02-14T13:45:00Z'),
      createdUntil: new Date('2025-03-01T00:00:00Z'),
    });

    expect(rows).toHaveLength(203);
    expect(rows[0].id).toBe(1);
    expect(rows[202].id).toBe(203);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(c.apiCalls).toBe(3);
    // formato del filtro: created=A..B (rango de días, inclusivo), per_page=100, page=n, sobre /repos/{org}/{repo}/actions/runs
    const first = new URL(urls[0]);
    expect(first.pathname).toBe('/repos/acme/svc-a/actions/runs');
    expect(first.searchParams.get('created')).toBe('2025-02-14..2025-02-28');
    expect(first.searchParams.get('per_page')).toBe('100');
    expect(first.searchParams.get('page')).toBe('1');
    expect(new URL(urls[2]).searchParams.get('page')).toBe('3');
  });

  it('corta cuando se alcanza total_count aunque la página venga llena (100 exactas ⇒ 1 llamada)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ total_count: 100, workflow_runs: Array.from({ length: 100 }, (_, i) => fakeRun(i + 1)) }),
    ) as unknown as typeof fetch;
    const rows = await listWorkflowRuns(client(fetchMock), 'svc-a', {
      createdSince: new Date('2025-01-01T00:00:00Z'),
      createdUntil: new Date('2025-02-01T00:00:00Z'),
    });
    expect(rows).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin runs: lista vacía, 1 llamada', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ total_count: 0, workflow_runs: [] })) as unknown as typeof fetch;
    const rows = await listWorkflowRuns(client(fetchMock), 'svc-a', {
      createdSince: new Date('2025-01-01T00:00:00Z'),
      createdUntil: new Date('2025-02-01T00:00:00Z'),
    });
    expect(rows).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401 ⇒ GithubAuthError', async () => {
    const fetchMock = vi.fn(async () => new Response('{"message":"Bad credentials"}', { status: 401 })) as unknown as typeof fetch;
    await expect(
      listWorkflowRuns(client(fetchMock), 'svc-a', {
        createdSince: new Date('2025-01-01T00:00:00Z'),
        createdUntil: new Date('2025-02-01T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(GithubAuthError);
  });

  it('ventana de 70 días ⇒ 3 consultas mensuales con created=A..B (fin de rango inclusivo)', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return jsonResponse({ total_count: 0, workflow_runs: [] });
    }) as unknown as typeof fetch;

    const rows = await listWorkflowRuns(client(fetchMock), 'svc-a', {
      createdSince: new Date('2025-02-14T13:45:00Z'),
      createdUntil: new Date('2025-04-25T10:00:00Z'),
    });

    expect(rows).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urls.map((u) => new URL(u).searchParams.get('created'))).toEqual([
      '2025-02-14..2025-02-28',
      '2025-03-01..2025-03-31',
      '2025-04-01..2025-04-25',
    ]);
    // nunca el formato antiguo `>=FECHA` (tope de 1000 resultados por consulta)
    for (const u of urls) expect(new URL(u).searchParams.get('created')).not.toMatch(/^>=/);
  });

  it('un rango con total_count 1000 se parte en sub-rangos hasta bajar del tope; se recogen todos los ids distintos', async () => {
    const queried: string[] = [];
    // El mock devuelve 1 run por día (id = día del mes) salvo que el rango pase de 15 días,
    // en cuyo caso simula el tope: total_count=1000 y runs "basura" (ids 9000+) que no deben contarse.
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const { from, to, days } = createdRange(String(url));
      queried.push(`${from}..${to}`);
      if (days > 15) {
        return jsonResponse({ total_count: 1000, workflow_runs: Array.from({ length: 100 }, (_, i) => fakeRun(9000 + i)) });
      }
      const runs: WorkflowRunApi[] = [];
      for (let d = Number(from.slice(8)); d <= Number(to.slice(8)); d++) runs.push(fakeRun(d));
      return jsonResponse({ total_count: runs.length, workflow_runs: runs });
    }) as unknown as typeof fetch;

    const c = client(fetchMock);
    const rows = await listWorkflowRuns(c, 'svc-a', {
      createdSince: new Date('2025-01-01T00:00:00Z'),
      createdUntil: new Date('2025-02-01T00:00:00Z'),
    });

    const ids = rows.map((r) => r.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(ids.some((id) => id >= 9000)).toBe(false);
    // mes entero (1000) → mitades [1..15] ok y [16..31] (1000) → [16..23] y [24..31]
    expect(queried).toEqual([
      '2025-01-01..2025-01-31',
      '2025-01-01..2025-01-15',
      '2025-01-16..2025-01-31',
      '2025-01-16..2025-01-23',
      '2025-01-24..2025-01-31',
    ]);
    expect(c.apiCalls).toBe(5);
  });

  it('un mismo id repetido en dos rangos se devuelve una sola vez', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ total_count: 2, workflow_runs: [fakeRun(7), fakeRun(8)] }),
    ) as unknown as typeof fetch;

    const rows = await listWorkflowRuns(client(fetchMock), 'svc-a', {
      createdSince: new Date('2025-01-20T00:00:00Z'),
      createdUntil: new Date('2025-02-10T00:00:00Z'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => r.id).sort()).toEqual([7, 8]);
  });
});
