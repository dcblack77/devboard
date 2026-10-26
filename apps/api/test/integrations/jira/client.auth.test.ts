import { describe, it, expect, vi } from 'vitest';
import { JiraClient, JiraAuthError, JiraApiError } from '../../../src/integrations/jira/client.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function client(fetchImpl: typeof fetch) {
  return new JiraClient({
    baseUrl: 'https://example.atlassian.net',
    email: 'bot@example.com',
    apiToken: 'fake-token',
    fetchImpl,
    timeoutMs: 5000,
    maxRetries: 0,
  });
}

describe('JiraClient.whoAmI', () => {
  it('llama a rest/api/3/myself y devuelve accountId', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://example.atlassian.net/rest/api/3/myself');
      return jsonResponse({ accountId: 'abc123', emailAddress: 'bot@example.com' });
    }) as unknown as typeof fetch;

    const me = await client(fetchMock).whoAmI();
    expect(me).toEqual({ accountId: 'abc123', emailAddress: 'bot@example.com' });
  });

  it('401 ⇒ rechaza con JiraAuthError (status 401, mensaje con las variables de entorno)', async () => {
    const fetchMock = vi.fn(async () => new Response('Unauthorized', { status: 401 })) as unknown as typeof fetch;

    const err = await client(fetchMock).whoAmI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JiraAuthError);
    expect(err).toBeInstanceOf(JiraApiError);
    expect((err as JiraAuthError).name).toBe('JiraAuthError');
    expect((err as JiraAuthError).status).toBe(401);
    expect((err as JiraAuthError).message).toBe(
      'Jira 401: credenciales inválidas o caducadas (JIRA_EMAIL / JIRA_API_TOKEN)',
    );
  });

  it('403 ⇒ también JiraAuthError', async () => {
    const fetchMock = vi.fn(async () => new Response('Forbidden', { status: 403 })) as unknown as typeof fetch;
    await expect(client(fetchMock).whoAmI()).rejects.toBeInstanceOf(JiraAuthError);
  });

  it('otros errores (404) se propagan como JiraApiError normal', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    const err = await client(fetchMock).whoAmI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JiraApiError);
    expect(err).not.toBeInstanceOf(JiraAuthError);
  });
});
