// @vitest-environment jsdom
/**
 * Contrato de la migración de Incidencias (/support) al kit de /github (`components/ui`).
 * Estructura y comportamiento, no píxeles. Ver `.hermes/plans/ui-g5.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Role } from '@teampulse/shared';

vi.mock('../../src/components/charts/BarChart', () => ({
  BarChart: ({ data }: { data: { labels: string[]; datasets: Array<{ label: string }> } }) => (
    <div data-testid="bar-chart" data-labels={data.labels.join('|')}>
      {data.datasets.map((d) => d.label).join(',')}
    </div>
  ),
}));
vi.mock('../../src/components/charts/LineChart', () => ({
  LineChart: ({ data }: { data: { labels: string[]; datasets: Array<{ label: string }> } }) => (
    <div data-testid="line-chart" data-labels={data.labels.join('|')}>
      {data.datasets.map((d) => d.label).join(',')}
    </div>
  ),
}));

import { Support } from '../../src/pages/Support';

const NOW = new Date('2026-11-06T12:00:00Z');

/** Tickets por fecha (nuevo campo `tickets` de GET /api/support): no limitados a la ventana de meses. */
const TICKETS = [
  { key: 'SUP-9', created: '2024-03-01T10:00:00.000Z', resolved: '2024-03-10T10:00:00.000Z', priority: 'Baja' },
  { key: 'SUP-1', created: '2026-10-20T09:00:00.000Z', resolved: '2026-10-25T09:00:00.000Z', priority: 'Alta' },
  { key: 'SUP-2', created: '2026-11-02T09:00:00.000Z', resolved: null, priority: 'Baja' },
];

function openTicket(i: number, extra: Record<string, unknown> = {}) {
  return {
    key: `SUP-${100 + i}`,
    summary: `Problema ${i}`,
    priority: i % 2 === 0 ? 'Alta' : 'Baja',
    status: 'Por hacer',
    ageH: 5,
    escalated: false,
    ...extra,
  };
}

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
  sla: { configured: false, firstResponseMetPct: null, resolutionMetPct: null, breachedOpen: [] as unknown[] },
  aging: { lt2d: 2, d2to7: 1, d7to30: 2, gt30d: 1 },
  open: [
    openTicket(1, { key: 'SUP-1', summary: 'No carga la app en el móvil cuando hay poca cobertura', priority: 'Alta', status: 'En curso', ageH: 72, escalated: true }),
    openTicket(2, { key: 'SUP-2', summary: 'Error al pagar', priority: 'Baja', status: 'Por hacer', ageH: 40 * 24 }),
  ],
  definitions: { received: 'Tickets creados en el periodo.' },
  tickets: TICKETS,
};

const WITH_SLA = {
  ...BASE,
  byPriority: [{ ...BASE.byPriority[0], firstResponseTargetH: 4, firstResponseMetPct: 0.95, resolutionTargetH: 48, resolutionMetPct: 0.8 }],
  sla: {
    configured: true,
    firstResponseMetPct: 0.95,
    resolutionMetPct: 0.7,
    breachedOpen: [{ key: 'SUP-1', summary: 'No carga la app', priority: 'Alta', ageH: 72, targetH: 48 }],
  },
};

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

function stub(body: unknown, status = 200) {
  const fn = vi.fn(
    async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

function renderPage(url = '/support') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Support role={'tl' as Role} />
    </MemoryRouter>,
  );
}

async function ready(body: unknown = BASE, url?: string) {
  stub(body);
  const utils = renderPage(url);
  await screen.findByLabelText('Resumen');
  return utils;
}

const sections = (c: HTMLElement) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];
const sectionTitles = (c: HTMLElement) => sections(c).map((d) => d.querySelector('summary h3')!.textContent);
const sectionByTitle = (c: HTMLElement, title: string) => {
  const d = sections(c).find((s) => s.querySelector('summary h3')!.textContent === title);
  if (!d) throw new Error(`Sección no encontrada: ${title}`);
  return d;
};

describe('Incidencias · UI kit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('layout', () => {
    it('usa PageShell: main.page.sup con cabecera .cr-head, título, entradilla, filtros e Imprimir', async () => {
      const { container } = await ready();
      const main = container.querySelector('main.page.sup');
      expect(main).toBeTruthy();
      const head = main!.querySelector('.cr-head') as HTMLElement;
      expect(head).toBeTruthy();
      expect(within(head).getByRole('heading', { level: 1, name: 'Incidencias' })).toBeTruthy();
      expect(head.querySelector('.lead')!.textContent).toMatch(/soporte/i);
      // Los filtros (Periodo) viven en las acciones de la cabecera, junto a Imprimir / PDF.
      expect(within(head).getByLabelText('Meses')).toBeTruthy();
      expect(within(head).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
      expect(container.querySelector('main.sys')).toBeNull();
    });

    it('el selector de tablero (varios tableros) está en la cabecera', async () => {
      const { container } = await ready(MULTI);
      const head = container.querySelector('main.page.sup .cr-head') as HTMLElement;
      expect(within(head).getByLabelText('Tablero')).toBeTruthy();
    });

    it('muestra un esqueleto mientras carga (sin el texto «Cargando…»)', async () => {
      vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch);
      const { container } = renderPage();
      const sk = screen.getByLabelText('Cargando incidencias');
      expect(sk.getAttribute('aria-busy')).toBe('true');
      expect(container.querySelector('.skeleton')).toBeTruthy();
      expect(screen.queryByText('Cargando…')).toBeNull();
    });

    it('error: mensaje dentro del PageShell', async () => {
      stub({ error: 'boom' }, 500);
      const { container } = renderPage();
      await screen.findByText('No se pudieron cargar los datos de incidencias.');
      expect(container.querySelector('main.page.sup p.error-msg')).toBeTruthy();
      expect(screen.getByRole('heading', { level: 1, name: 'Incidencias' })).toBeTruthy();
    });

    it('sin tablero configurado: mensaje dentro del PageShell', async () => {
      stub({ configured: false });
      const { container } = renderPage();
      await screen.findByText(/Configura el tablero de soporte/);
      expect(container.querySelector('main.page.sup')).toBeTruthy();
    });
  });

  describe('KPIs', () => {
    const groupLabels = (c: HTMLElement) => [...c.querySelectorAll('.kpi-group')].map((g) => g.querySelector('.kpi-group-label')!.textContent);
    const kpiLabels = (g: Element) => [...g.querySelectorAll('.kpi .l')].map((l) => l.textContent);

    it('agrupa en Volumen, Tiempos y SLA dentro de «Resumen», sin deltas inventados', async () => {
      const { container } = await ready(WITH_SLA);
      const summary = screen.getByLabelText('Resumen');
      expect(groupLabels(summary)).toEqual(['Volumen', 'Tiempos', 'SLA']);
      const groups = [...summary.querySelectorAll('.kpi-group')];
      expect(kpiLabels(groups[0]!)).toEqual(['Recibidas', 'Resueltas', 'Abiertas ahora', 'Escaladas al equipo', 'Reabiertas']);
      expect(kpiLabels(groups[1]!)).toEqual(['Resolución p50', '1ª acción p50', 'Tiempo en equipo técnico p50']);
      expect(kpiLabels(groups[2]!)).toEqual(['1ª respuesta en SLA', 'Resolución en SLA']);
      // El semáforo del SLA se mantiene.
      expect(groups[2]!.querySelector('.kpi.rag-green')!.textContent).toContain('95%');
      expect(groups[2]!.querySelector('.kpi.rag-red')!.textContent).toContain('70%');
      expect(container.querySelector('.kpi-delta')).toBeNull();
    });

    it('sin SLA configurado: solo Volumen y Tiempos, y la nota de SLA dentro del resumen', async () => {
      await ready(BASE);
      const summary = screen.getByLabelText('Resumen');
      expect(groupLabels(summary)).toEqual(['Volumen', 'Tiempos']);
      expect(within(summary).getByText(/Sin objetivos de SLA\. Defínelos en Ajustes → SLA de soporte\./)).toBeTruthy();
    });
  });

  describe('secciones', () => {
    it('orden, contadores y estado inicial (un tablero, con SLA)', async () => {
      const { container } = await ready(WITH_SLA);
      expect(sectionTitles(container)).toEqual([
        'Fuera de SLA (abiertas)',
        'Por prioridad',
        'Antigüedad de abiertas',
        'Por producto (etiqueta)',
        'Por tipo',
        'Abiertas',
        'Definiciones',
      ]);
      const ds = sections(container);
      expect(ds.map((d) => d.querySelector('summary .count')?.textContent ?? null)).toEqual(['1', '1', '6', '1', '1', '2', null]);
      expect(ds.map((d) => d.open)).toEqual([true, true, true, true, true, true, false]);
    });

    it('sin SLA no hay sección «Fuera de SLA»; con varios tableros «Por tablero» va primero', async () => {
      const { container } = await ready(MULTI);
      const titles = sectionTitles(container);
      expect(titles).not.toContain('Fuera de SLA (abiertas)');
      expect(titles[0]).toBe('Por tablero');
      const board = sectionByTitle(container, 'Por tablero');
      expect(board.querySelector('summary .count')!.textContent).toBe('2');
      expect(within(board).getByText('HELP')).toBeTruthy();
    });

    it('prioridad + antigüedad y producto + tipo van en parejas (.cr-pair)', async () => {
      const { container } = await ready();
      const pairOf = (title: string) => sectionByTitle(container, title).parentElement!;
      expect(pairOf('Por prioridad').className).toContain('cr-pair');
      expect(pairOf('Por prioridad')).toBe(pairOf('Antigüedad de abiertas'));
      expect(pairOf('Por producto (etiqueta)').className).toContain('cr-pair');
      expect(pairOf('Por producto (etiqueta)')).toBe(pairOf('Por tipo'));
      // Las barras de antigüedad siguen dentro de su sección.
      expect(within(sectionByTitle(container, 'Antigüedad de abiertas')).getByRole('img', { name: /Antigüedad de abiertas/ })).toBeTruthy();
    });

    it('recuerda el estado guardado en devboard.support.sections', async () => {
      localStorage.setItem('devboard.support.sections', JSON.stringify({ open: false, definitions: true }));
      const { container } = await ready();
      expect(sectionByTitle(container, 'Abiertas').open).toBe(false);
      expect(sectionByTitle(container, 'Definiciones').open).toBe(true);
    });

    it('plegar una sección se guarda', async () => {
      const { container } = await ready();
      const d = sectionByTitle(container, 'Por tipo');
      d.open = false;
      fireEvent(d, new Event('toggle'));
      expect(JSON.parse(localStorage.getItem('devboard.support.sections')!)).toMatchObject({ types: false });
    });

    it('las definiciones están en su sección', async () => {
      const { container } = await ready();
      expect(within(sectionByTitle(container, 'Definiciones')).getByText('Tickets creados en el periodo.')).toBeTruthy();
    });
  });

  describe('tablas', () => {
    it('todas las tablas son modernas (buscador, filas por página)', async () => {
      const { container } = await ready(WITH_SLA);
      for (const t of ['Fuera de SLA (abiertas)', 'Por prioridad', 'Por producto (etiqueta)', 'Por tipo', 'Abiertas']) {
        const s = sectionByTitle(container, t);
        expect(s.querySelector('table.ft-modern'), t).toBeTruthy();
        expect(s.querySelector('.fbar-modern'), t).toBeTruthy();
        expect(within(s).getByLabelText('Filas por página'), t).toBeTruthy();
      }
    });

    it('Abiertas: pill de estado, badge de antigüedad, resumen con ellipsis y filtros en píldora', async () => {
      const { container } = await ready();
      const s = sectionByTitle(container, 'Abiertas');
      const pills = [...s.querySelectorAll('tbody .st-pill')].map((p) => [p.textContent, p.className]);
      expect(pills).toEqual([
        ['En curso', 'st-pill st-accent'],
        ['Por hacer', 'st-pill st-muted'],
      ]);
      const badges = [...s.querySelectorAll('tbody .age-badge')].map((b) => [b.textContent, b.className]);
      expect(badges).toEqual([
        ['3.0 d', 'age-badge age-new'],
        ['40 d', 'age-badge age-old'],
      ]);
      const title = s.querySelector('tbody td.td-title') as HTMLElement;
      expect(title.textContent).toBe('No carga la app en el móvil cuando hay poca cobertura');
      expect(title.getAttribute('title')).toBe('No carga la app en el móvil cuando hay poca cobertura');
      for (const f of ['Prioridad', 'Estado', 'Escalada']) expect(within(s).getByLabelText(f)).toBeTruthy();
    });

    it('Abiertas: 20 filas por defecto y «Todas» las muestra', async () => {
      const open = Array.from({ length: 25 }, (_, i) => openTicket(i));
      const { container } = await ready({ ...BASE, open, totals: { ...BASE.totals, openNow: 25 } });
      const s = sectionByTitle(container, 'Abiertas');
      expect(s.querySelector('summary .count')!.textContent).toBe('25');
      expect(s.querySelectorAll('tbody tr')).toHaveLength(20);
      fireEvent.change(within(s).getByLabelText('Filas por página'), { target: { value: '0' } });
      expect(s.querySelectorAll('tbody tr')).toHaveLength(25);
    });

    it('Fuera de SLA: badge de antigüedad', async () => {
      const { container } = await ready(WITH_SLA);
      const s = sectionByTitle(container, 'Fuera de SLA (abiertas)');
      expect(s.querySelector('tbody .age-badge')!.textContent).toBe('3.0 d');
    });

    it('estados vacíos: sin abiertas y sin incumplimientos de SLA', async () => {
      const { container } = await ready({ ...WITH_SLA, open: [], sla: { ...WITH_SLA.sla, breachedOpen: [] } });
      const open = sectionByTitle(container, 'Abiertas');
      expect(open.querySelector('.empty-state')!.textContent).toBe('No hay incidencias abiertas 🎉');
      expect(open.querySelector('table')).toBeNull();
      const breach = sectionByTitle(container, 'Fuera de SLA (abiertas)');
      expect(breach.querySelector('summary .count')!.textContent).toBe('0');
      expect(breach.querySelector('.empty-state')!.textContent).toBe('Ninguna abierta fuera de SLA.');
    });
  });

  describe('gráfica recibidas vs resueltas (TimeSeriesChart)', () => {
    const total = (c: HTMLElement) => c.querySelector('.cr-chart .cr-total')!.textContent;

    it('dos series a partir de tickets[], por semana y 12 meses por defecto', async () => {
      const { container } = await ready();
      expect(screen.getByRole('heading', { name: 'Recibidas vs resueltas por semana' })).toBeTruthy();
      expect(screen.getByTestId('bar-chart').textContent).toBe('Recibidas,Resueltas');
      expect((screen.getByLabelText('Rango') as HTMLSelectElement).value).toBe('12m');
      // SUP-9 (2024) queda fuera de los 12 meses.
      expect(total(container)).toBe('Recibidas: 2 · Resueltas: 1');
      const labels = screen.getByTestId('bar-chart').dataset.labels!.split('|');
      expect(labels[labels.length - 1]).toBe('2026-W45');
    });

    it('re-agrupa en cliente: «Todo» incluye tickets antiguos; Mes cambia el título; se guarda', async () => {
      const { container } = await ready();
      fireEvent.change(screen.getByLabelText('Rango'), { target: { value: 'all' } });
      expect(total(container)).toBe('Recibidas: 3 · Resueltas: 2');
      fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
      expect(screen.getByRole('heading', { name: 'Recibidas vs resueltas por mes' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Línea' }));
      expect(screen.getByTestId('line-chart')).toBeTruthy();
      expect(JSON.parse(localStorage.getItem('devboard.support.chart')!)).toMatchObject({ granularity: 'month', type: 'line', preset: 'all' });
    });

    it('aplica las preferencias guardadas en devboard.support.chart', async () => {
      localStorage.setItem('devboard.support.chart', JSON.stringify({ type: 'bar', granularity: 'year', preset: 'all' }));
      await ready();
      expect(screen.getByRole('heading', { name: 'Recibidas vs resueltas por año' })).toBeTruthy();
      expect(screen.getByTestId('bar-chart').dataset.labels).toBe('2024|2025|2026');
    });

    it('el rango de la gráfica es independiente del selector de meses de los KPIs', async () => {
      const fn = stub(BASE);
      const { container } = renderPage();
      await screen.findByLabelText('Resumen');
      fireEvent.change(screen.getByLabelText('Meses'), { target: { value: '3' } });
      await waitFor(() => expect(fn.mock.calls.some((c) => String((c as unknown[])[0]).includes('months=3'))).toBe(true));
      await screen.findByLabelText('Resumen');
      expect((screen.getByLabelText('Rango') as HTMLSelectElement).value).toBe('12m');
      expect(total(container)).toBe('Recibidas: 2 · Resueltas: 1');
    });

    it('sin tickets en la respuesta no rompe (gráfica vacía con totales a 0)', async () => {
      const { tickets: _omit, ...legacy } = BASE;
      const { container } = await ready(legacy);
      expect(total(container)).toBe('Recibidas: 0 · Resueltas: 0');
    });
  });
});

