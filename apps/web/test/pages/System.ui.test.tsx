// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../src/components/charts/BarChart', () => ({
  BarChart: ({ data }: { data: { labels: string[]; datasets: { label: string; data: number[] }[] } }) => (
    <div
      data-testid="bar-chart"
      data-labels={data.labels.join('|')}
      data-series={data.datasets.map((d) => `${d.label}:${d.data.join(',')}`).join(';')}
    />
  ),
}));
vi.mock('../../src/components/charts/LineChart', () => ({
  LineChart: ({ data }: { data: { labels: string[] } }) => (
    <div data-testid="line-chart" data-labels={data.labels.join('|')} />
  ),
}));

import { System } from '../../src/pages/System';

const NOW = new Date('2026-03-04T12:00:00Z');

const REPO_ACTIVE = {
  repo: 'org/app',
  deploys: 12,
  deploysPerWeek: 0.25,
  cfr: 0.1,
  hotfixPct: 0,
  leadTimeH: { p50: 48, p85: 96 },
  codingH: 3,
  pickupH: 2,
  reviewH: 6,
  mergeToProdH: 1,
  recoveryH: 30,
};

const REPO_IDLE = {
  ...REPO_ACTIVE,
  repo: 'org/idle',
  deploys: 0,
  deploysPerWeek: 0,
  cfr: null,
  hotfixPct: null,
  leadTimeH: { p50: null, p85: null },
  recoveryH: null,
};

const PRACTICE = {
  period: '2026-Q1',
  prs: 30,
  sizeP50: 120,
  pctOver400: 0.1,
  pickupP50H: 2,
  firstReviewToMergeP50H: 5,
  humanReviewsPerPr: 1.2,
  pctMergedWithoutHumanApproval: 0.05,
};

const DAYS = [
  { date: '2026-03-01', closed: 1, closedAll: 2, viaQaNegocio: 0 },
  { date: '2026-03-02', closed: 6, closedAll: 9, viaQaNegocio: 4 },
];

function systemData(over: Record<string, unknown> = {}) {
  return {
    window: { from: '2025-03-04T00:00:00.000Z', to: '2026-03-04T00:00:00.000Z' },
    repos: [REPO_ACTIVE, REPO_IDLE],
    practice: { byQuarter: [PRACTICE], byMonth: [{ ...PRACTICE, period: '2026-03', prs: 11 }] },
    flow: {
      tickets: 20,
      cycleKanbanH: 120,
      cycleKanbanP85H: 240,
      engineeringH: 48,
      waitingH: 72,
      pctWithWait: 0.5,
      flowEfficiency: 0.4,
      states: [
        { status: 'En curso', p50H: 48, pctOfTickets: 1 },
        { status: 'Bloqueado', p50H: 24, pctOfTickets: 0.2 },
      ],
      reworkPct: 0.1,
      closedBeforeDeliveredPct: 0.2,
    },
    batches: {
      days: DAYS,
      batches: [DAYS[1]],
      weekdayHistogram: [0, 3, 2, 5, 1, 6, 0],
      hourHistogram: Array.from({ length: 24 }, (_, h) => (h === 12 ? 7 : 0)),
    },
    definitions: { deploys: 'Runs del workflow de despliegue con éxito.', cfr: 'Fallos / despliegues.' },
    ...over,
  };
}

function stub(body: unknown | 'pending') {
  const fn = vi.fn(() =>
    body === 'pending'
      ? new Promise<Response>(() => {})
      : Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

async function renderPage(body: unknown = systemData()) {
  stub(body);
  const utils = render(<System />);
  await screen.findByText('Lotes de cierre');
  return utils;
}

const sections = (c: HTMLElement) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];
const sectionByTitle = (c: HTMLElement, title: string) => {
  const s = sections(c).find((d) => d.querySelector('summary h3')!.textContent === title);
  if (!s) throw new Error(`no section ${title}`);
  return s;
};
const groupKpis = (c: HTMLElement, label: string) => {
  const g = [...c.querySelectorAll('.kpi-group')].find((x) => x.querySelector('.kpi-group-label')!.textContent === label);
  if (!g) throw new Error(`no group ${label}`);
  return [...g.querySelectorAll('.kpi .l')].map((l) => l.textContent);
};

describe('Sistema (UI /github)', () => {
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

  it('PageShell: cabecera con título, entradilla, filtros Periodo/Repositorio e imprimir', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main.page')!;
    expect(main).toBeTruthy();
    const head = main.querySelector('.cr-head') as HTMLElement;
    expect(within(head).getByRole('heading', { level: 1, name: 'Sistema' })).toBeTruthy();
    expect(head.querySelector('.lead')).toBeTruthy();
    expect(within(head).getByLabelText('Meses')).toBeTruthy();
    expect(within(head).getByLabelText('Repositorio')).toBeTruthy();
    expect(within(head).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
  });

  it('mientras carga: esqueleto, pero la cabecera y los filtros siguen visibles', () => {
    stub('pending');
    const { container } = render(<System />);
    const busy = container.querySelector('[aria-busy="true"]')!;
    expect(busy).toBeTruthy();
    expect(busy.getAttribute('aria-label')).toBe('Cargando sistema');
    expect(busy.querySelector('.skeleton')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Sistema' })).toBeTruthy();
    expect(screen.getByLabelText('Meses')).toBeTruthy();
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('resumen agrupado en Entrega y Flujo', async () => {
    const { container } = await renderPage();
    const summary = screen.getByLabelText('Resumen');
    expect([...summary.querySelectorAll('.kpi-group-label')].map((l) => l.textContent)).toEqual(['Entrega', 'Flujo']);
    expect(groupKpis(container, 'Entrega')).toEqual(['Despliegues a producción', 'Despliegues / semana', 'PRs']);
    expect(groupKpis(container, 'Flujo')).toEqual(['Ciclo hasta Done p50', 'Flow efficiency', 'Retrabajo']);
  });

  it('secciones plegables con contador; Definiciones cerrada por defecto', async () => {
    const { container } = await renderPage();
    const secs = sections(container);
    expect(secs.map((d) => d.querySelector('summary h3')!.textContent)).toEqual([
      'DORA por repo',
      'Flujo del ticket a producción',
      'Práctica de PR',
      'Lotes de cierre',
      'Definiciones',
    ]);
    expect(secs.map((d) => d.open)).toEqual([true, true, true, true, false]);
    expect(secs.map((d) => d.querySelector('summary .count')?.textContent)).toEqual(['1', '2', '1', '1', '2']);
  });

  it('recuerda el estado de las secciones en devboard.system.sections', async () => {
    localStorage.setItem('devboard.system.sections', JSON.stringify({ dora: false, defs: true }));
    const { container } = await renderPage();
    expect(sectionByTitle(container, 'DORA por repo').open).toBe(false);
    expect(sectionByTitle(container, 'Definiciones').open).toBe(true);
    const practice = sectionByTitle(container, 'Práctica de PR');
    practice.open = false;
    fireEvent(practice, new Event('toggle'));
    expect(JSON.parse(localStorage.getItem('devboard.system.sections')!)).toEqual({ dora: false, defs: true, practice: false });
  });

  it('DORA: tabla moderna; el contador sigue a «Mostrar repos sin despliegues»', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'DORA por repo');
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    expect(within(sec).getByRole('searchbox', { name: 'Buscar' })).toBeTruthy();
    expect(within(sec).getByLabelText('Filas por página')).toBeTruthy();
    expect(sec.querySelector('table.ft-modern')).toBeTruthy();
    fireEvent.click(within(sec).getByLabelText(/Mostrar repos sin despliegues/));
    expect(sec.querySelector('summary .count')!.textContent).toBe('2');
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('DORA sin repos con despliegues: estado vacío', async () => {
    const { container } = await renderPage(systemData({ repos: [REPO_IDLE] }));
    const sec = sectionByTitle(container, 'DORA por repo');
    expect(sec.querySelector('.empty-state')!.textContent).toBe('No hay repos con despliegues en el periodo.');
    expect(sec.querySelector('table')).toBeNull();
  });

  it('Flujo: estados con pill de color en tabla moderna', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Flujo del ticket a producción');
    expect(sec.querySelector('table.ft-modern')).toBeTruthy();
    const pills = [...sec.querySelectorAll('tbody .st-pill')].map((p) => [p.textContent, p.className]);
    expect(pills).toEqual([
      ['En curso', 'st-pill st-accent'],
      ['Bloqueado', 'st-pill st-warn'],
    ]);
  });

  it('Práctica de PR: tabla moderna, conmutador trimestre/mes y estado vacío', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Práctica de PR');
    expect(sec.querySelector('table.ft-modern')).toBeTruthy();
    expect(within(sec).getByLabelText('Filas por página')).toBeTruthy();
    fireEvent.click(within(sec).getByRole('button', { name: 'Por mes' }));
    expect(within(sec).getByText('2026-03')).toBeTruthy();
    cleanup();
    const empty = await renderPage(systemData({ practice: { byQuarter: [], byMonth: [] } }));
    const s2 = sectionByTitle(empty.container, 'Práctica de PR');
    expect(s2.querySelector('summary .count')!.textContent).toBe('0');
    expect(s2.querySelector('.empty-state')!.textContent).toBe('No hay PRs en el periodo.');
  });

  it('Cierres: gráfica temporal configurable con contados y total, guardada en devboard.system.closures', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Lotes de cierre');
    const chart = sec.querySelector('.cr-chart') as HTMLElement;
    expect(chart).toBeTruthy();
    expect(within(chart).getByRole('heading', { name: 'Cierres por semana' })).toBeTruthy();
    expect((within(chart).getByLabelText('Rango') as HTMLSelectElement).value).toBe('all');
    const bar = within(chart).getByTestId('bar-chart');
    expect(bar.dataset.labels).toBe('2026-W09|2026-W10');
    expect(bar.dataset.series).toBe('Contados:1,6;Total:2,9');
    expect(chart.querySelector('.cr-total')!.textContent).toBe('Contados: 7 · Total: 11');

    fireEvent.click(within(chart).getByRole('button', { name: 'Día' }));
    expect(within(chart).getByRole('heading', { name: 'Cierres por día' })).toBeTruthy();
    fireEvent.click(within(chart).getByRole('button', { name: 'Línea' }));
    expect(within(chart).getByTestId('line-chart')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('devboard.system.closures')!)).toMatchObject({ granularity: 'day', type: 'line' });
  });

  it('Cierres: aplica las preferencias guardadas', async () => {
    localStorage.setItem('devboard.system.closures', JSON.stringify({ type: 'bar', granularity: 'month', preset: 'all' }));
    const { container } = await renderPage();
    const chart = sectionByTitle(container, 'Lotes de cierre').querySelector('.cr-chart') as HTMLElement;
    expect(within(chart).getByRole('heading', { name: 'Cierres por mes' })).toBeTruthy();
    expect(within(chart).getByTestId('bar-chart').dataset.labels).toBe('03-2026');
  });

  it('Lotes: tabla moderna de días con lote y estado vacío', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Lotes de cierre');
    const tables = [...sec.querySelectorAll('table.ft-modern')];
    expect(tables).toHaveLength(1);
    const headers = [...tables[0]!.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Fecha', 'Contados', 'Total', 'Vía QA']);
    const cells = [...tables[0]!.querySelectorAll('tbody tr td')].map((td) => td.textContent);
    expect(cells).toEqual(['2026-03-02', '6', '9', '4']);
    cleanup();
    const empty = await renderPage(
      systemData({ batches: { days: DAYS, batches: [], weekdayHistogram: [0, 0, 0, 0, 0, 0, 0], hourHistogram: Array(24).fill(0) } }),
    );
    const s2 = sectionByTitle(empty.container, 'Lotes de cierre');
    expect(s2.querySelector('summary .count')!.textContent).toBe('0');
    expect(s2.querySelector('.empty-state')!.textContent).toBe('Sin lotes en el periodo.');
  });

  it('Definiciones dentro de la sección, sin <details> anidado', async () => {
    localStorage.setItem('devboard.system.sections', JSON.stringify({ defs: true }));
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Definiciones');
    expect(sec.querySelector('details')).toBeNull();
    expect(within(sec).getByText('Fallos / despliegues.')).toBeTruthy();
  });
});
