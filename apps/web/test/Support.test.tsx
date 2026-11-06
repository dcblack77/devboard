// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Support } from '../src/pages/Support';

vi.mock('../src/components/charts/BarChart', () => ({
  BarChart: ({ data }: { data: { datasets: Array<{ label: string }> } }) => (
    <div data-testid="bar-chart">{data.datasets.map((d) => d.label).join(',')}</div>
  ),
}));

const BASE = {
  window: { from: '2025-11-06T00:00:00.000Z', to: '2026-11-06T00:00:00.000Z' },
  configured: true,
  project: 'SUP',
  boards: ['SUP'],
  boardNames: { SUP: null },
  selectedBoard: 'ALL',
  byBoard: [{ board: 'SUP', received: 40, resolved: 35, openNow: 6, resolutionP50H: 48, escalatedPct: 0.25 }],
  totals: { received: 40, resolved: 35, openNow: 6, escalatedPct: 0.25, reopenedPct: 0.05, linkedToDevPct: 0.1 },
  times: {
    firstActionH: { p50: 3, p85: 10 },
    resolutionH: { p50: 48, p85: 120 },
    techTimeH: { p50: 30, p85: 80 },
  },
  weekly: [
    { week: '2026-W43', received: 5, resolved: 4 },
    { week: '2026-W44', received: 3, resolved: 6 },
  ],
  byPriority: [
    {
      priority: 'Alta',
      count: 12,
      resolutionP50H: 24,
      firstResponseTargetH: null,
      firstResponseMetPct: null,
      resolutionTargetH: null,
      resolutionMetPct: null,
    },
  ],
  byLabel: [{ label: 'app-movil', count: 9, openNow: 2 }],
  byType: [{ type: 'Incidencia', count: 30 }],
  sla: { configured: false, firstResponseMetPct: null, resolutionMetPct: null, breachedOpen: [] },
  aging: { lt2d: 2, d2to7: 1, d7to30: 2, gt30d: 1 },
  open: [
    { key: 'SUP-1', summary: 'No carga la app', priority: 'Alta', status: 'En curso', ageH: 72, escalated: true },
    { key: 'SUP-2', summary: 'Error al pagar', priority: 'Baja', status: 'Abierta', ageH: 5, escalated: false },
  ],
  definitions: { received: 'Tickets creados en el periodo.' },
};

const WITH_SLA = {
  ...BASE,
  byPriority: [
    {
      ...BASE.byPriority[0],
      firstResponseTargetH: 4,
      firstResponseMetPct: 0.95,
      resolutionTargetH: 48,
      resolutionMetPct: 0.8,
    },
  ],
  sla: {
    configured: true,
    firstResponseMetPct: 0.95,
    resolutionMetPct: 0.7,
    breachedOpen: [{ key: 'SUP-1', summary: 'No carga la app', priority: 'Alta', ageH: 72, targetH: 48 }],
  },
};

function stub(body: unknown) {
  const fn = vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

function renderPage(role: 'tl' | 'viewer' | null = 'tl', url = '/incidencias') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Support role={role} />
    </MemoryRouter>,
  );
}

describe('Support', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a configure message (with link for TL) when there is no support board', async () => {
    stub({ configured: false });
    const { container } = renderPage('tl');
    await waitFor(() =>
      expect(container.querySelector('main')?.textContent).toContain('Configura el tablero de soporte en Ajustes → Tableros de Jira.'),
    );
    expect(container.querySelector('a[href="/settings"]')).toBeTruthy();
    expect(container.querySelector('main.sys.sup')).toBeTruthy();
  });

  it('does not link to settings for non-TL users', async () => {
    stub({ configured: false });
    const { container } = renderPage('viewer');
    await screen.findByText(/Configura el tablero de soporte/);
    expect(container.querySelector('a[href="/settings"]')).toBeNull();
  });

  it('requests 12 months by default and refetches when months change', async () => {
    const fn = stub(BASE);
    renderPage();
    await screen.findByLabelText('Resumen');
    expect(String((fn.mock.calls[0] as unknown[])[0])).toContain('/api/support?months=12&board=ALL');
    fireEvent.change(screen.getByLabelText('Meses'), { target: { value: '3' } });
    await waitFor(() => expect(fn.mock.calls.some((c) => String((c as unknown[])[0]).includes('/api/support?months=3&board=ALL'))).toBe(true));
  });

  it('renders summary KPIs and the sections', async () => {
    stub(BASE);
    renderPage();
    const summary = await screen.findByLabelText('Resumen');
    for (const l of ['Recibidas', 'Resueltas', 'Abiertas ahora', 'Escaladas al equipo', 'Reabiertas', 'Resolución p50', '1ª acción p50', 'Tiempo en equipo técnico p50']) {
      expect(within(summary).getByText(l)).toBeTruthy();
    }
    expect(within(summary).getByText('40')).toBeTruthy();
    expect(within(summary).getByText('25%')).toBeTruthy();
    expect(within(summary).getByText('2.0 d')).toBeTruthy(); // resolution p50 48h
    expect(within(summary).getByText('3.0 h')).toBeTruthy(); // first action p50
    for (const t of ['SLA', 'Recibidas vs resueltas por semana', 'Por prioridad', 'Antigüedad de abiertas', 'Por producto (etiqueta)', 'Por tipo', 'Abiertas', 'Definiciones']) {
      expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    }
    expect(screen.getByTestId('bar-chart').textContent).toBe('Recibidas,Resueltas');
    expect(screen.getByText('app-movil')).toBeTruthy();
    expect(screen.getByText('Incidencia')).toBeTruthy();
    expect(screen.getByText('No carga la app')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Antigüedad de abiertas/ })).toBeTruthy();
  });

  it('shows a muted note when SLA is not configured', async () => {
    stub(BASE);
    renderPage();
    expect(await screen.findByText(/Sin objetivos de SLA\. Defínelos en Ajustes → SLA de soporte\./)).toBeTruthy();
    expect(screen.queryByText('1ª respuesta en SLA')).toBeNull();
  });

  it('shows SLA KPIs with RAG and the breached table when SLA is configured', async () => {
    stub(WITH_SLA);
    const { container } = renderPage();
    expect(await screen.findByText('1ª respuesta en SLA')).toBeTruthy();
    expect(screen.getByText('Resolución en SLA')).toBeTruthy();
    expect(screen.queryByText(/Sin objetivos de SLA/)).toBeNull();
    expect(container.querySelector('.kpi.rag-green')?.textContent).toContain('95%');
    expect(container.querySelector('.kpi.rag-red')?.textContent).toContain('70%');
    expect(screen.getByRole('heading', { name: 'Fuera de SLA (abiertas)' })).toBeTruthy();
    expect(screen.getAllByText('SUP-1').length).toBeGreaterThan(1);
  });

  describe('board selector', () => {
    const MULTI = {
      ...BASE,
      project: null,
      boards: ['SUP', 'HELP'],
      boardNames: { SUP: 'Soporte clientes', HELP: null },
      byBoard: [
        { board: 'SUP', received: 30, resolved: 28, openNow: 4, resolutionP50H: 48, escalatedPct: 0.3 },
        { board: 'HELP', received: 10, resolved: 7, openNow: 2, resolutionP50H: 12, escalatedPct: null },
      ],
    };

    it('is hidden with a single support board and there is no per-board table', async () => {
      stub(BASE);
      renderPage();
      await screen.findByLabelText('Resumen');
      expect(screen.queryByLabelText('Tablero')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Por tablero' })).toBeNull();
    });

    it('is shown with two boards (Todos + names) and renders the per-board table', async () => {
      stub(MULTI);
      renderPage();
      await screen.findByLabelText('Resumen');
      const select = screen.getByLabelText('Tablero') as HTMLSelectElement;
      expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
        ['ALL', 'Todos'],
        ['SUP', 'Soporte clientes'],
        ['HELP', 'HELP'],
      ]);
      const table = screen.getByRole('heading', { name: 'Por tablero' }).closest('section') as HTMLElement;
      expect(within(table).getByText('HELP')).toBeTruthy();
      expect(within(table).getByText('30')).toBeTruthy();
    });

    it('fetches with the board from the URL and refetches when the board changes', async () => {
      const fn = stub(MULTI);
      renderPage('tl', '/incidencias?board=HELP');
      await screen.findByLabelText('Resumen');
      expect(String((fn.mock.calls[0] as unknown[])[0])).toContain('/api/support?months=12&board=HELP');
      expect((screen.getByLabelText('Tablero') as HTMLSelectElement).value).toBe('HELP');
      fireEvent.change(screen.getByLabelText('Tablero'), { target: { value: 'SUP' } });
      await waitFor(() => expect(fn.mock.calls.some((c) => String((c as unknown[])[0]).includes('board=SUP'))).toBe(true));
    });
  });
});
