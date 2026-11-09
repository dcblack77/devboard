// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installStaticApi, staticFile, staticKey } from '../src/lib/staticMode';

const original = window.fetch;
afterEach(() => {
  window.fetch = original;
});

describe('staticKey / staticFile', () => {
  it('sorts query params so the same request always maps to the same file', () => {
    expect(staticKey('/api/system?repo=all&months=3')).toBe('/api/system?months=3&repo=all');
    expect(staticKey('/api/home')).toBe('/api/home');
  });

  it('maps a key to a safe relative file name', () => {
    expect(staticFile('/api/system?months=3&repo=all')).toBe('data/system_months_3_repo_all.json');
    expect(staticFile('/api/team/ana-garcia')).toBe('data/team_ana-garcia.json');
    expect(staticFile('/api/support?board=ALL&months=12')).toBe('data/support_board_ALL_months_12.json');
  });
});

describe('installStaticApi', () => {
  function setup(files: Record<string, unknown>) {
    const real = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      const hit = Object.entries(files).find(([f]) => href.endsWith('/' + f));
      return hit
        ? new Response(JSON.stringify(hit[1]), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response('nope', { status: 404 });
    });
    installStaticApi('https://pages.example/space/devboard/', real as unknown as typeof fetch);
    return real;
  }

  it('answers /api/auth/me as a read-only viewer without a session', async () => {
    const real = setup({});
    const body = await (await window.fetch('/api/auth/me')).json();
    expect(body).toEqual({ role: 'viewer', authDisabled: true });
    expect(real).not.toHaveBeenCalled();
  });

  it('serves GETs from the exported file relative to the site base', async () => {
    const real = setup({ 'data/system_months_3_repo_all.json': { ok: 1 } });
    const res = await window.fetch('/api/system?repo=all&months=3', { credentials: 'include' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
    expect(String(real.mock.calls[0][0])).toBe('https://pages.example/space/devboard/data/system_months_3_repo_all.json');
  });

  it('returns 404 JSON for data that was not exported', async () => {
    setup({});
    const res = await window.fetch('/api/unknown');
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/estática/);
  });

  it('refuses writes', async () => {
    const real = setup({});
    const res = await window.fetch('/api/sync/run', { method: 'POST' });
    expect(res.status).toBe(403);
    expect(real).not.toHaveBeenCalled();
  });

  it('passes non-API URLs through untouched', async () => {
    const real = setup({ 'logo.svg': {} });
    await window.fetch('https://pages.example/space/devboard/logo.svg');
    expect(real).toHaveBeenCalledTimes(1);
  });
});
