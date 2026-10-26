import { describe, it, expect, vi } from 'vitest';
import { GithubClient, GithubAuthError, GithubApiError } from '../../../src/integrations/github/client.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function client(fetchImpl: typeof fetch) {
  return new GithubClient({ token: 't', org: 'acme', repos: [], fetchImpl, maxRetries: 1, sleepImpl: async () => {} });
}

describe('GithubClient.whoAmI', () => {
  it('query viewer { login } ⇒ devuelve login', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.query).toContain('viewer');
      return jsonResponse({ data: { viewer: { login: 'devboard-bot' } } });
    }) as unknown as typeof fetch;

    await expect(client(fetchMock).whoAmI()).resolves.toEqual({ login: 'devboard-bot' });
  });

  it('401 ⇒ GithubAuthError con status 401', async () => {
    const fetchMock = vi.fn(async () => new Response('{"message":"Bad credentials"}', { status: 401 })) as unknown as typeof fetch;
    const err = await client(fetchMock).whoAmI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GithubAuthError);
    expect(err).toBeInstanceOf(GithubApiError);
    expect((err as GithubAuthError).name).toBe('GithubAuthError');
    expect((err as GithubAuthError).status).toBe(401);
    expect((err as GithubAuthError).message).toContain('GITHUB_TOKEN');
  });

  it('200 con errors y sin data ⇒ GithubAuthError', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ errors: [{ message: 'Resource not accessible' }] })) as unknown as typeof fetch;
    await expect(client(fetchMock).whoAmI()).rejects.toBeInstanceOf(GithubAuthError);
  });

  it('200 con data.viewer null ⇒ GithubAuthError', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { viewer: null } })) as unknown as typeof fetch;
    await expect(client(fetchMock).whoAmI()).rejects.toBeInstanceOf(GithubAuthError);
  });

  it('otros HTTP (403 rate limit, 404) se propagan como GithubApiError normal', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    const err = await client(fetchMock).whoAmI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GithubApiError);
    expect(err).not.toBeInstanceOf(GithubAuthError);
  });
});
