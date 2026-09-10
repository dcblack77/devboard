import { describe, it, expect, vi } from 'vitest';
import { JiraClient } from '../../../src/integrations/jira/client.js';
import page1 from './fixtures/page1.json' with { type: 'json' };
import page2 from './fixtures/page2.json' with { type: 'json' };
import changelogFull from './fixtures/changelog-full.json' with { type: 'json' };

function jsonResponse(body: unknown, init: Partial<{ status: number; headers: Record<string, string> }> = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function config(fetchImpl: typeof fetch) {
  return {
    baseUrl: 'https://example.atlassian.net',
    email: 'bot@example.com',
    apiToken: 'fake-token',
    fetchImpl,
    timeoutMs: 5000,
    maxRetries: 3,
  };
}

describe('JiraClient.searchAll', () => {
  it('pagina con nextPageToken hasta isLast', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (!url.includes('nextPageToken')) {
        return jsonResponse({ issues: page1.issues, nextPageToken: 'tok-2', isLast: false });
      }
      return jsonResponse({ issues: page2.issues, isLast: true });
    }) as unknown as typeof fetch;

    const client = new JiraClient(config(fetchMock));
    const issues = await client.searchAll('project = DEV', ['summary', 'status']);

    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.key)).toEqual(['DEV-101', 'DEV-102']);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('nextPageToken=tok-2');
  });

  it('completa el changelog truncado (total > histories.length)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/changelog?')) {
        return jsonResponse(changelogFull);
      }
      return jsonResponse({ issues: page2.issues, isLast: true });
    }) as unknown as typeof fetch;

    const client = new JiraClient(config(fetchMock));
    const issues = await client.searchAll('project = DEV', ['summary'], { expand: 'changelog' });

    expect(issues).toHaveLength(1);
    expect(issues[0].changelog?.histories).toHaveLength(4);
  });
});

describe('JiraClient retries', () => {
  it('reintenta en 429 respetando Retry-After y termina en éxito', async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } });
      }
      return jsonResponse({ issues: [], isLast: true });
    }) as unknown as typeof fetch;

    const client = new JiraClient(config(fetchMock));
    const issues = await client.searchAll('project = DEV', ['summary']);

    expect(issues).toEqual([]);
    expect(attempt).toBe(2);
  });

  it('lanza JiraApiError tras agotar reintentos en 500', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const client = new JiraClient({ ...config(fetchMock), maxRetries: 1 });

    await expect(client.searchAll('project = DEV', ['summary'])).rejects.toThrow(/500/);
  });
});

describe('JiraClient.epicsWithChildren', () => {
  it('agrupa hijos bajo su épica', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes('issuetype = Epic')) {
        return jsonResponse({
          issues: [
            {
              key: 'DEV-1',
              fields: { summary: 'Épica X', status: { name: 'En curso' }, assignee: null, created: '2026-01-01T00:00:00.000+0100' },
            },
          ],
          isLast: true,
        });
      }
      return jsonResponse({
        issues: [
          {
            key: 'DEV-2',
            fields: {
              summary: 'Historia hija',
              status: { name: 'Backlog' },
              assignee: null,
              issuetype: { name: 'Historia' },
              parent: { key: 'DEV-1' },
            },
          },
        ],
        isLast: true,
      });
    }) as unknown as typeof fetch;

    const client = new JiraClient(config(fetchMock));
    const epics = await client.epicsWithChildren('DEV');

    expect(epics).toHaveLength(1);
    expect(epics[0].key).toBe('DEV-1');
    expect(epics[0].children).toHaveLength(1);
    expect(epics[0].children[0].key).toBe('DEV-2');
  });
});
