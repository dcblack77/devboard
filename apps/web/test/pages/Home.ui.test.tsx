// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../src/components/charts/BarChart', () => ({
  BarChart: ({ data }: { data: { labels: string[] } }) => (
    <div data-testid="bar-chart" data-labels={data.labels.join('|')} />
  ),
}));
vi.mock('../../src/components/charts/LineChart', () => ({
  LineChart: ({ data }: { data: { labels: string[] } }) => (
    <div data-testid="line-chart" data-labels={data.labels.join('|')} />
  ),
}));

import { Home } from '../../src/pages/Home';

type Rag = { name: string; slug: string; pct: number; color: 'r' | 'a' | 'g'; reason: string };

const WEEKS = ['2026-W38', '2026-W39', '2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44', '2026-W45'];

function rag(i: number, color: 'r' | 'a' | 'g' = 'g'): Rag {
  return { name: `Iniciativa ${i + 1}`, slug: `ini-${i + 1}`, pct: 10 + i, color, reason: color === 'r' ? '2 bloqueadas' : 'Avanza' };
}

const RAGS: Rag[] = [rag(0, 'r'), rag(1, 'a'), ...Array.from({ length: 23 }, (_, i) => rag(i + 2))];

function homeData(over: { rag?: Rag[]; weekLabels?: string[]; weekTotals?: number[]; github?: unknown; ragCounts?: unknown } = {}) {
  return {
    numbers: {
      lastWeek: 1,
      avg4: 1.5,
      weekLabels: over.weekLabels ?? WEEKS,
      // 4 anteriores = 5, 4 últimas = 6 → +20 %.
      weekTotals: over.weekTotals ?? [1, 1, 2, 1, 2, 1, 2, 1],
      open: 10,
      blocked: 2,
      blocked5d: 0,
      aged: 1,
      attention: 2,
      delivered4w: 6,
      bugs4w: 1,
      feat4w: 5,
      cycleMean: 30,
      github:
        over.github === undefined
          ? { open: 4, waiting: 3, firstReview: 2, toMerge: 20, noApproval: 2, pctNoApproval: 15, hotfix4w: 6 }
          : over.github,
    },
    trend: null,
    rag: over.rag ?? RAGS,
    ragCounts: over.ragCounts ?? { green: 23, amber: 1, red: 1 },
  };
}

function stub(home: unknown | 'pending') {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/home')) {
      if (home === 'pending') return new Promise<Response>(() => {});
      return Promise.resolve(new Response(JSON.stringify(home), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    const body = url.includes('/api/support') ? { configured: false } : { runs: [], health: {} };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

async function renderPage(home: unknown = homeData()) {
  stub(home);
  const utils = render(<Home />);
  await screen.findByRole('heading', { level: 1, name: 'Inicio' });
  await screen.findByText('Resumen del equipo');
  return utils;
}

const groupLabels = (c: HTMLElement) =>
  [...c.querySelectorAll('.kpi-group .kpi-group-label')].map((l) => l.textContent);
const groupKpis = (c: HTMLElement, label: string) => {
  const g = [...c.querySelectorAll('.kpi-group')].find((x) => x.querySelector('.kpi-group-label')!.textContent === label);
  if (!g) throw new Error(`no group ${label}`);
  return [...g.querySelectorAll('.kpi .l')].map((l) => l.textContent);
};
const kpiByLabel = (c: HTMLElement, label: string) => {
  const l = [...c.querySelectorAll('.kpi .l')].find((x) => x.textContent === label);
  if (!l) throw new Error(`no kpi ${label}`);
  return l.closest('.kpi') as HTMLElement;
};
const sections = (c: HTMLElement) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];
const sectionByTitle = (c: HTMLElement, title: string) => {
  const s = sections(c).find((d) => d.querySelector('summary h3')!.textContent === title);
  if (!s) throw new Error(`no section ${title}`);
  return s;
};

describe('Inicio (UI /github)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('muestra un esqueleto mientras carga', () => {
    stub('pending');
    const { container } = render(<Home />);
    const busy = container.querySelector('main[aria-busy="true"]');
    expect(busy).toBeTruthy();
    expect(busy!.getAttribute('aria-label')).toBe('Cargando inicio');
    expect(container.querySelector('.skeleton')).toBeTruthy();
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('usa PageShell: main.page, cabecera con título, entradilla y botón de imprimir', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main.page')!;
    expect(main).toBeTruthy();
    const head = main.querySelector('.cr-head')!;
    expect(within(head as HTMLElement).getByRole('heading', { level: 1, name: 'Inicio' })).toBeTruthy();
    expect(head.querySelector('.lead')!.textContent).toBe('Estado general del equipo: compromiso, entrega, riesgo y calidad.');
    expect(within(head as HTMLElement).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Imprimir / PDF' })).toHaveLength(1);
  });

  it('agrupa los KPIs en Compromiso, Entrega, Riesgo y Calidad con etiquetas cortas', async () => {
    const { container } = await renderPage();
    expect(groupLabels(container)).toEqual(['Compromiso', 'Entrega', 'Riesgo', 'Calidad']);
    expect(groupKpis(container, 'Compromiso')).toEqual(['En verde', 'En ámbar', 'En rojo']);
    expect(groupKpis(container, 'Entrega')).toEqual(['Última semana', 'Media 4 sem', 'Entregado · 4 sem', 'Ciclo medio']);
    expect(groupKpis(container, 'Riesgo')).toEqual([
      'Bloqueadas',
      'Bloqueadas +5 d',
      'Envejecidas',
      'Requieren atención',
      'PRs esperando review',
    ]);
    expect(groupKpis(container, 'Calidad')).toEqual(['Errores · 4 sem', 'Funcionalidad · 4 sem', 'Sin aprobación', 'Hotfixes · 4 sem']);
  });

  it('sin GitHub no muestra los KPIs de PRs', async () => {
    const { container } = await renderPage(homeData({ github: null }));
    expect(groupKpis(container, 'Riesgo')).toEqual(['Bloqueadas', 'Bloqueadas +5 d', 'Envejecidas', 'Requieren atención']);
    expect(groupKpis(container, 'Calidad')).toEqual(['Errores · 4 sem', 'Funcionalidad · 4 sem']);
  });

  it('bordes solo con umbral: rojo/ámbar en semáforo, bloqueadas > 0, sin aprobación > 10 %, hotfixes > 5', async () => {
    const { container } = await renderPage();
    expect(kpiByLabel(container, 'En verde').className).toBe('kpi');
    expect(kpiByLabel(container, 'En ámbar').className).toContain('kpi-edge-amber');
    expect(kpiByLabel(container, 'En rojo').className).toContain('kpi-edge-red');
    expect(kpiByLabel(container, 'Bloqueadas').className).toContain('kpi-edge-red');
    expect(kpiByLabel(container, 'Bloqueadas +5 d').className).toBe('kpi');
    expect(kpiByLabel(container, 'Sin aprobación').className).toContain('kpi-edge-amber');
    expect(kpiByLabel(container, 'Sin aprobación').querySelector('.v')!.textContent).toBe('15%');
    expect(kpiByLabel(container, 'Hotfixes · 4 sem').className).toContain('kpi-edge-amber');
    // Ya no se usan las clases rag-* de la versión anterior.
    expect(container.querySelector('.kpi[class*="rag-"]')).toBeNull();
  });

  it('delta de «Entregado · 4 sem» a partir de la serie semanal real; sin 8 semanas no hay delta', async () => {
    const { container } = await renderPage();
    const d = kpiByLabel(container, 'Entregado · 4 sem').querySelector('.kpi-delta')!;
    expect(d.className).toBe('kpi-delta up good');
    expect(d.textContent).toBe('▲ 20 %');
    expect(container.querySelectorAll('.kpi-delta')).toHaveLength(1);
    cleanup();
    const short = await renderPage(homeData({ weekLabels: WEEKS.slice(1), weekTotals: [1, 2, 1, 2, 1, 2, 1] }));
    expect(short.container.querySelector('.kpi-delta')).toBeNull();
  });

  it('secciones plegables Iniciativas y Entregas por semana, con contador y abiertas por defecto', async () => {
    const { container } = await renderPage();
    const secs = sections(container);
    expect(secs.map((d) => d.querySelector('summary h3')!.textContent)).toEqual(['Iniciativas', 'Entregas por semana']);
    expect(secs.map((d) => d.open)).toEqual([true, true]);
    expect(sectionByTitle(container, 'Iniciativas').querySelector('summary .count')!.textContent).toBe('25');
  });

  it('recuerda el estado de las secciones en devboard.home.sections', async () => {
    localStorage.setItem('devboard.home.sections', JSON.stringify({ initiatives: false }));
    const { container } = await renderPage();
    expect(sectionByTitle(container, 'Iniciativas').open).toBe(false);
    expect(sectionByTitle(container, 'Entregas por semana').open).toBe(true);
    const weekly = sectionByTitle(container, 'Entregas por semana');
    weekly.open = false;
    fireEvent(weekly, new Event('toggle'));
    expect(JSON.parse(localStorage.getItem('devboard.home.sections')!)).toEqual({ initiatives: false, weekly: false });
  });

  it('iniciativas en tabla moderna: buscador, filtro de semáforo, 20 filas por página', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Iniciativas');
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    expect(within(sec).getByRole('searchbox', { name: 'Buscar' })).toBeTruthy();
    const headers = [...sec.querySelectorAll('thead th')].map((th) => th.textContent!.replace(/[ ▲▼]+$/, ''));
    expect(headers).toEqual(['Iniciativa', 'Semáforo', 'Avance', 'Motivo']);
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(20);
    fireEvent.change(within(sec).getByLabelText('Filas por página'), { target: { value: '0' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(25);

    const filter = within(sec).getByLabelText('Semáforo') as HTMLSelectElement;
    expect([...filter.options].map((o) => o.value)).toEqual(['', 'Verde', 'Ámbar', 'Rojo']);
    fireEvent.change(filter, { target: { value: 'Rojo' } });
    const rows = sec.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('Iniciativa 1');
    expect(rows[0]!.querySelector('.rag-dot.red')).toBeTruthy();
    expect(rows[0]!.textContent).toContain('10%');
    expect(rows[0]!.textContent).toContain('2 bloqueadas');
  });

  it('el nombre y el motivo largos van con elipsis y tooltip', async () => {
    const long = 'Un motivo larguísimo que no cabe en la columna de la tabla de iniciativas';
    const { container } = await renderPage(homeData({ rag: [{ ...rag(0, 'a'), reason: long }] }));
    const row = sectionByTitle(container, 'Iniciativas').querySelector('tbody tr')!;
    const cell = [...row.querySelectorAll('td')].find((td) => td.textContent === long)!;
    expect(cell.className).toContain('td-title');
    expect(cell.getAttribute('title')).toBe(long);
  });

  it('estado vacío de iniciativas', async () => {
    const { container } = await renderPage(homeData({ rag: [], ragCounts: { green: 0, amber: 0, red: 0 } }));
    const sec = sectionByTitle(container, 'Iniciativas');
    expect(sec.querySelector('summary .count')!.textContent).toBe('0');
    expect(sec.querySelector('.empty-state')!.textContent).toBe('No hay iniciativas en marcha.');
    expect(sec.querySelector('table')).toBeNull();
  });

  it('gráfica semanal (serie agregada de la API) dentro de su sección; vacío con mensaje', async () => {
    const { container } = await renderPage();
    const weekly = sectionByTitle(container, 'Entregas por semana');
    expect(within(weekly).getByTestId('line-chart').dataset.labels).toBe(WEEKS.join('|'));
    cleanup();
    const empty = await renderPage(homeData({ weekLabels: [], weekTotals: [] }));
    const sec = sectionByTitle(empty.container, 'Entregas por semana');
    expect(sec.querySelector('.empty-state')!.textContent).toBe('Aún no hay semanas con entregas.');
    expect(within(sec).queryByTestId('line-chart')).toBeNull();
  });

  it('el aviso de sincronización sigue dentro de la página, antes del resumen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith('/api/home')
          ? homeData()
          : url.endsWith('/api/sync/status')
            ? { runs: [], health: { jira: { lastOkAt: null, stale: true, lastError: 'Jira 401' } } }
            : { configured: false };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch,
    );
    const { container } = render(<Home />);
    const banner = await screen.findByRole('alert');
    await screen.findByText('Resumen del equipo');
    expect(container.querySelector('main.page')!.contains(banner)).toBe(true);
  });
});
