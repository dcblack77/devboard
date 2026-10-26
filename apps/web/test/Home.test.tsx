// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { Home } from '../src/pages/Home';

const HOME = {
  numbers: {
    lastWeek: 3,
    avg4: 2.5,
    weekLabels: [],
    weekTotals: [],
    open: 10,
    blocked: 0,
    blocked5d: 0,
    aged: 1,
    attention: 2,
    delivered4w: 8,
    bugs4w: 1,
    feat4w: 7,
    cycleMean: 30,
    github: null,
  },
  trend: null,
  rag: [],
  ragCounts: { green: 1, amber: 0, red: 0 },
};

function okHealth() {
  return { lastOkAt: '2026-10-26T08:00:00.000Z', stale: false, lastError: null };
}

function mockFetch(health: unknown) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.endsWith('/api/home') ? HOME : url.endsWith('/api/sync/status') ? { runs: [], health } : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

describe('Home — banner de salud de sincronización', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('muestra banner rojo cuando Jira está stale, con fecha y error', async () => {
    mockFetch({
      jira: {
        lastOkAt: '2026-10-01T07:30:00.000Z',
        stale: true,
        lastError: 'Jira 401: credenciales inválidas o caducadas (JIRA_EMAIL / JIRA_API_TOKEN)',
      },
      github: okHealth(),
    });

    render(<Home />);

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('Jira sin datos desde');
    expect(banner.textContent).toContain('2026');
    expect(banner.textContent).toContain('— Jira 401: credenciales inválidas o caducadas');
    expect(banner.textContent).not.toContain('GitHub sin datos');
  });

  it('muestra banner de GitHub cuando está stale', async () => {
    mockFetch({
      jira: okHealth(),
      github: { lastOkAt: null, stale: true, lastError: 'GitHub 401: credenciales inválidas o caducadas (GITHUB_TOKEN)' },
    });

    render(<Home />);

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('GitHub sin datos desde nunca — GitHub 401');
  });

  it('no muestra banner cuando ambas fuentes están sanas', async () => {
    const fetchMock = mockFetch({ jira: okHealth(), github: okHealth() });

    render(<Home />);

    await screen.findByText('Inicio');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/sync/status'), expect.anything()));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/sin datos desde/)).toBeNull();
  });
});
