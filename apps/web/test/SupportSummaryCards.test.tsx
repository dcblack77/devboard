// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SupportSummaryCards } from '../src/components/SupportSummaryCards';
import { Home } from '../src/pages/Home';
import { Corporate } from '../src/pages/Corporate';

const SUMMARY = {
  window: { from: '2026-08-06T00:00:00.000Z', to: '2026-11-06T00:00:00.000Z' },
  configured: true,
  project: null,
  boards: ['SUP', 'HELP'],
  boardNames: { SUP: null, HELP: null },
  selectedBoard: 'ALL',
  byBoard: [],
  totals: { received: 40, resolved: 35, openNow: 6, escalatedPct: 0.25, reopenedPct: 0.05, linkedToDevPct: 0.1 },
  times: {
    firstActionH: { p50: 3, p85: 10 },
    resolutionH: { p50: 48, p85: 120 },
    techTimeH: { p50: 30, p85: 80 },
  },
  weekly: [],
  byPriority: [],
  byLabel: [],
  byType: [],
  sla: { configured: false, firstResponseMetPct: null, resolutionMetPct: null, breachedOpen: [] },
  aging: { lt2d: 2, d2to7: 1, d7to30: 2, gt30d: 1 },
  open: [],
  definitions: {},
};

const WITH_SLA = {
  ...SUMMARY,
  sla: { configured: true, firstResponseMetPct: 0.95, resolutionMetPct: 0.7, breachedOpen: [] },
};

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

function mockFetch(support: unknown, status = 200) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/support')) {
      return new Response(JSON.stringify(support), { status, headers: { 'content-type': 'application/json' } });
    }
    const body = url.endsWith('/api/home') ? HOME : url.endsWith('/api/sync/status') ? { runs: [], health: {} } : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

function kpi(label: string): HTMLElement {
  const el = screen.getByText(label).closest('.kpi');
  if (!el) throw new Error(`no kpi ${label}`);
  return el as HTMLElement;
}

describe('SupportSummaryCards', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('pide todos los tableros con la ventana indicada y pinta los KPIs', async () => {
    const fetchMock = mockFetch(SUMMARY);
    render(
      <MemoryRouter>
        <SupportSummaryCards months={3} />
      </MemoryRouter>,
    );

    await screen.findByText('Incidencias');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/support?months=3&board=ALL'), expect.anything());
    expect(kpi('Abiertas ahora').textContent).toContain('6');
    expect(kpi('Recibidas').textContent).toContain('40');
    expect(kpi('Resueltas').textContent).toContain('35');
    expect(kpi('Escaladas al equipo').textContent).toContain('25%');
    expect(kpi('Resolución p50').textContent).toContain('2.0 d');
    expect(screen.getByText('Últimos 3 meses')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Ver incidencias →' });
    expect(link.getAttribute('href')).toBe('/support');
  });

  it('sin SLA configurado no muestra los KPIs de SLA', async () => {
    mockFetch(SUMMARY);
    render(
      <MemoryRouter>
        <SupportSummaryCards months={12} />
      </MemoryRouter>,
    );
    await screen.findByText('Incidencias');
    expect(screen.getByText('Últimos 12 meses')).toBeTruthy();
    expect(screen.queryByText('1ª respuesta en SLA')).toBeNull();
    expect(screen.queryByText('Resolución en SLA')).toBeNull();
  });

  it('con SLA configurado muestra cumplimiento con semáforo', async () => {
    mockFetch(WITH_SLA);
    render(
      <MemoryRouter>
        <SupportSummaryCards months={3} />
      </MemoryRouter>,
    );
    await screen.findByText('Incidencias');
    const first = kpi('1ª respuesta en SLA');
    expect(first.textContent).toContain('95%');
    expect(first.className).toContain('rag-green');
    const res = kpi('Resolución en SLA');
    expect(res.textContent).toContain('70%');
    expect(res.className).toContain('rag-red');
  });

  it('no pinta nada si soporte no está configurado', async () => {
    const fetchMock = mockFetch({ configured: false });
    const { container } = render(
      <MemoryRouter>
        <SupportSummaryCards months={3} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
  });

  it('no pinta nada si la petición falla', async () => {
    const fetchMock = mockFetch({ error: 'boom' }, 500);
    const { container } = render(
      <MemoryRouter>
        <SupportSummaryCards months={3} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
  });

  it('funciona fuera de un router (enlace plano)', async () => {
    mockFetch(SUMMARY);
    render(<SupportSummaryCards months={3} />);
    const link = await screen.findByRole('link', { name: 'Ver incidencias →' });
    expect(link.getAttribute('href')).toBe('/support');
  });
});

describe('Inicio y Corporativo incluyen el bloque de Incidencias', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Inicio: bloque tras el resumen, con ventana de 3 meses', async () => {
    const fetchMock = mockFetch(SUMMARY);
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    await screen.findByText('Incidencias');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/support?months=3&board=ALL'), expect.anything());
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf('Incidencias')).toBe(titles.indexOf('Resumen del equipo') + 1);
  });

  it('Corporativo: bloque tras el resumen ejecutivo, con ventana de 12 meses', async () => {
    const fetchMock = mockFetch(SUMMARY);
    render(
      <MemoryRouter>
        <Corporate />
      </MemoryRouter>,
    );
    await screen.findByText('Incidencias');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/support?months=12&board=ALL'), expect.anything());
    expect(screen.getByText('Últimos 12 meses')).toBeTruthy();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf('Incidencias')).toBe(titles.indexOf('Resumen ejecutivo') + 1);
  });

  it('Inicio sin soporte configurado no muestra el bloque', async () => {
    mockFetch({ configured: false });
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    await screen.findByText('Entrega');
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Incidencias')).toBeNull();
  });
});
