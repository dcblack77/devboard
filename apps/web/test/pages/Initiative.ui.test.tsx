// @vitest-environment jsdom
/**
 * Contrato UI de /initiatives/:slug (detalle) con el kit de /github: PageShell con RAG en la
 * entradilla y vuelta a la lista, KPIs agrupados (delta real desde `weekly`), gráfica
 * configurable de entregas sobre `issues[].deliveredAt` (ya lo envía la API), secciones
 * plegables recordadas, tablas modernas con StatusPill/Avatar/AgeBadge y estados vacíos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../src/components/charts/BarChart', () => ({
  BarChart: ({ data }: { data: { labels: string[] } }) => <div data-testid="bar-chart" data-labels={data.labels.join('|')} />,
}));
vi.mock('../../src/components/charts/LineChart', () => ({
  LineChart: ({ data }: { data: { labels: string[] } }) => <div data-testid="line-chart" data-labels={data.labels.join('|')} />,
}));

import { Initiative } from '../../src/pages/Initiative';

const NOW = new Date('2026-11-06T12:00:00Z');
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

function issue(i: number, extra: Record<string, unknown> = {}) {
  return {
    key: `MAIN-${i}`,
    type: 'Historia',
    summary: `Tarea ${i}`,
    status: 'Done',
    macro: 'entregada',
    assigneeRaw: 'alice',
    counted: true,
    done: true,
    created: iso(60),
    deliveredAt: iso(i * 7 + 1),
    inStatusHours: 10,
    attention: [],
    ...extra,
  };
}

const ISSUES = [
  issue(1),
  issue(2),
  issue(3),
  // No contada (p. ej. subtarea): no suma en la gráfica.
  issue(4, { counted: false }),
  issue(5, { status: 'Blocked', macro: 'bloqueada', done: false, deliveredAt: null, assigneeRaw: 'bob', inStatusHours: 40 * 24 }),
];

const ATTENTION = [
  { ...ISSUES[4], summary: 'Arregla login', why: ['Bloqueada', 'Sin movimiento'] },
];

const wk = (week: string, completed: number) => ({ week, completedByType: { Historia: completed }, completed });

const DETAIL = {
  name: 'Pagos',
  slug: 'pagos',
  epics: [
    { key: 'MAIN-100', summary: 'Pasarela nueva', status: 'In Progress', childrenTotal: 4, childrenByMacro: {}, pctDone: 75 },
    { key: 'MAIN-200', summary: 'Facturas', status: 'Done', childrenTotal: 1, childrenByMacro: {}, pctDone: 100 },
  ],
  childrenTotal: 5,
  pctDone: 80,
  inPeriod: 5,
  open: 1,
  done: 4,
  blockedNow: 1,
  throughput4w: 3,
  cycleMean: 48,
  // 8 semanas: 4 anteriores suman 4, las 4 últimas 6 → +50 %.
  weekly: [wk('2026-W38', 1), wk('2026-W39', 1), wk('2026-W40', 1), wk('2026-W41', 1), wk('2026-W42', 2), wk('2026-W43', 1), wk('2026-W44', 2), wk('2026-W45', 1)],
  people: [
    { dev: 'Ana García', total: 3, open: 0, done: 3 },
    { dev: 'bob', total: 2, open: 1, done: 1 },
  ],
  attention: ATTENTION,
  issues: ISSUES,
  rag: { color: 'a', reason: 'Hay bloqueos' },
};

function stub(detail: Record<string, unknown> = DETAIL) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ initiatives: detail }), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/initiatives/pagos']}>
      <Routes>
        <Route path="/initiatives/:slug" element={<Initiative />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderPage() {
  const utils = renderDetail();
  await screen.findByRole('heading', { level: 1, name: 'Pagos' });
  return utils;
}

const sections = (c: HTMLElement) => [...c.querySelectorAll('details')] as HTMLDetailsElement[];
const byTitle = (c: HTMLElement, t: string) => sections(c).find((d) => d.querySelector('summary h3')!.textContent === t)!;

describe('Iniciativa (detalle) — diseño /github', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    stub();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('PageShell: título, RAG en la entradilla, volver a la lista e Imprimir / PDF', async () => {
    const { container } = await renderPage();
    const head = container.querySelector('main.page .cr-head') as HTMLElement;
    expect(head.querySelector('h1')!.textContent).toBe('Pagos');
    const lead = head.querySelector('.lead')!;
    expect(lead.textContent).toBe('80% completado — Hay bloqueos');
    expect(lead.querySelector('.rag-dot.amber')).toBeTruthy();
    expect(within(head).getByRole('link', { name: '← Iniciativas' }).getAttribute('href')).toBe('/initiatives');
    expect(within(head).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
  });

  it('esqueleto mientras carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = renderDetail();
    expect(container.querySelector('main[aria-busy="true"]')!.getAttribute('aria-label')).toBe('Cargando iniciativa');
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('KPIs agrupados en Volumen y Ritmo; delta real de entregas; bloqueados en rojo', async () => {
    const { container } = await renderPage();
    const groups = [...container.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Volumen', 'Ritmo']);
    const labels = (g: Element) => [...g.querySelectorAll('.kpi .l')].map((l) => l.textContent);
    expect(labels(groups[0]!)).toEqual(['Elementos totales', 'En periodo', 'Abiertos', 'Entregados']);
    expect(labels(groups[1]!)).toEqual(['Entregado · 4 sem', 'Tiempo de ciclo (media)', 'Bloqueados ahora']);
    const kpi = (label: string) => [...container.querySelectorAll('.kpi')].find((k) => k.querySelector('.l')!.textContent === label)!;
    expect(kpi('Entregado · 4 sem').querySelector('.v')!.firstChild!.textContent).toBe('3');
    const delta = kpi('Entregado · 4 sem').querySelector('.kpi-delta')!;
    expect(delta.className).toBe('kpi-delta up good');
    expect(delta.textContent).toBe('▲ 50 %');
    expect(kpi('Bloqueados ahora').className).toContain('kpi-edge-red');
    expect(kpi('Tiempo de ciclo (media)').querySelector('.v')!.textContent).toBe('2.0 d');
    expect(container.querySelectorAll('.kpi-delta')).toHaveLength(1);
  });

  it('sin 8 semanas de histórico no hay delta ni borde si no hay bloqueos', async () => {
    stub({ ...DETAIL, weekly: DETAIL.weekly.slice(-4), blockedNow: 0 });
    const { container } = await renderPage();
    expect(container.querySelector('.kpi-delta')).toBeNull();
    expect(container.querySelector('.kpi-edge-red')).toBeNull();
  });

  it('gráfica configurable de entregas desde issues[].deliveredAt (solo contadas), guardada en devboard.initiative.chart', async () => {
    const { container } = await renderPage();
    expect(screen.getByRole('heading', { name: 'Entregas por semana' })).toBeTruthy();
    expect(container.querySelector('.cr-chart .cr-total')!.textContent).toBe('3 entregados');
    expect((screen.getByLabelText('Rango') as HTMLSelectElement).value).toBe('12m');
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    expect(screen.getByRole('heading', { name: 'Entregas por mes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Línea' }));
    expect(screen.getByTestId('line-chart')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('devboard.initiative.chart')!)).toMatchObject({ granularity: 'month', type: 'line' });
  });

  it('secciones en orden, con contador; Issues cerrada por defecto', async () => {
    const { container } = await renderPage();
    const ds = sections(container);
    expect(ds.map((d) => d.querySelector('summary h3')!.textContent)).toEqual([
      'Épicas',
      'Requieren atención',
      'Personas',
      'Issues',
    ]);
    expect(ds.map((d) => d.querySelector('summary .count')!.textContent)).toEqual(['2', '1', '2', '5']);
    expect(ds.map((d) => d.open)).toEqual([true, true, true, false]);
    // La gráfica va antes de las secciones.
    const chart = container.querySelector('.cr-chart')!;
    expect(chart.compareDocumentPosition(ds[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('recuerda secciones en devboard.initiative.sections', async () => {
    localStorage.setItem('devboard.initiative.sections', JSON.stringify({ epics: false, issues: true }));
    const { container } = await renderPage();
    expect(sections(container).map((d) => d.open)).toEqual([false, true, true, true]);
  });

  it('Épicas: tabla moderna con StatusPill y barra de avance', async () => {
    const { container } = await renderPage();
    const sec = byTitle(container, 'Épicas');
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    expect(within(sec).getByLabelText('Filas por página')).toBeTruthy();
    expect([...sec.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Clave', 'Resumen', 'Estado', 'Elementos', 'Avance']);
    const pills = [...sec.querySelectorAll('tbody .st-pill')].map((p) => [p.textContent, p.className]);
    expect(pills).toEqual([
      ['In Progress', 'st-pill st-accent'],
      ['Done', 'st-pill st-ok'],
    ]);
    const first = sec.querySelector('tbody tr')!;
    expect(first.textContent).toContain('75%');
    expect((first.querySelector('.init-bar > span') as HTMLElement).style.width).toBe('75%');
    expect(first.querySelector('td.td-title')!.getAttribute('title')).toBe('Pasarela nueva');
  });

  it('Requieren atención: StatusPill, motivo, antigüedad en el estado y PR', async () => {
    const { container } = await renderPage();
    const sec = byTitle(container, 'Requieren atención');
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    expect([...sec.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual([
      'Clave',
      'Resumen',
      'Estado',
      'Persona',
      'En el estado',
      'Motivo',
      'PR',
    ]);
    const row = sec.querySelector('tbody tr')!;
    const pill = row.querySelector('.st-pill')!;
    expect([pill.textContent, pill.className]).toEqual(['Blocked', 'st-pill st-warn']);
    expect(row.querySelector('.avatar')!.textContent).toBe('BO');
    const badge = row.querySelector('.age-badge')!;
    expect([badge.textContent, badge.className]).toEqual(['40 d', 'age-badge age-old']);
    expect(row.textContent).toContain('Bloqueada · Sin movimiento');
  });

  it('Personas con avatar y números', async () => {
    const { container } = await renderPage();
    const sec = byTitle(container, 'Personas');
    const rows = [...sec.querySelectorAll('tbody tr')];
    expect(rows.map((r) => r.querySelector('.avatar')!.textContent)).toEqual(['AG', 'BO']);
    expect([...rows[0]!.querySelectorAll('td.n')].map((td) => td.textContent)).toEqual(['3', '0', '3']);
  });

  it('Issues: tabla moderna con filtros Tipo/Estado/Persona y StatusPill macro→estado real', async () => {
    const { container } = await renderPage();
    const sec = byTitle(container, 'Issues');
    expect([...sec.querySelectorAll('select.pill')].map((s) => s.getAttribute('aria-label'))).toEqual(['Tipo', 'Estado', 'Persona']);
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(5);
    fireEvent.change(within(sec).getByLabelText('Persona'), { target: { value: 'bob' } });
    const rows = [...sec.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.querySelector('.st-pill')!.className).toBe('st-pill st-warn');
  });

  it('estados vacíos específicos', async () => {
    stub({ ...DETAIL, epics: [], attention: [], people: [], issues: [], weekly: [] });
    const { container } = await renderPage();
    const empty = (t: string) => byTitle(container, t).querySelector('.empty-state')!.textContent;
    expect(empty('Épicas')).toBe('Esta iniciativa no tiene épicas.');
    expect(empty('Requieren atención')).toBe('Nada requiere atención 🎉');
    expect(empty('Personas')).toBe('Sin personas asignadas.');
    expect(empty('Issues')).toBe('No hay issues en el periodo.');
  });

  it('error de carga', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    renderDetail();
    expect((await screen.findByText('No se pudo cargar la iniciativa.')).className).toBe('error-msg');
  });
});
