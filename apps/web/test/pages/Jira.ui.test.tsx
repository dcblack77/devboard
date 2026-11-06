// @vitest-environment jsdom
/**
 * Contrato de la migración de «Entrega» (/jira) al kit de /github (ver `.hermes/plans/ui-g2.md`).
 * Se prueba comportamiento y estructura (clases y textos del kit), no el marcado incidental.
 */
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

import { Jira } from '../../src/pages/Jira';

const DAY = 86_400_000;
const NOW = new Date('2026-11-06T12:00:00Z');
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

interface Issue {
  key: string;
  type: string;
  summary: string;
  status: string;
  macro: string;
  assigneeRaw: string | null;
  epicKey: string | null;
  created: string;
  resolved: string | null;
  deliveredAt: string | null;
  done: boolean;
  ageHours: number;
}

function issue(i: number, extra: Partial<Issue> = {}): Issue {
  return {
    key: `MAIN-${i + 1}`,
    type: i % 3 === 0 ? 'Historia' : 'Tarea',
    summary: `Trabajo ${i + 1}`,
    status: 'Finalizada',
    macro: 'entregada',
    assigneeRaw: 'alice',
    epicKey: i % 2 === 0 ? 'MAIN-100' : null,
    created: iso(i * 7 + 10),
    resolved: iso(i * 7 + 1),
    deliveredAt: iso(i * 7 + 1),
    done: true,
    ageHours: (i * 7 + 10) * 24,
    ...extra,
  };
}

const open = (i: number, extra: Partial<Issue> = {}) =>
  issue(i, { status: 'En curso', macro: 'en_marcha', resolved: null, deliveredAt: null, done: false, ...extra });

/**
 * 25 issues: las 5 primeras son las que se comprueban fila a fila (página 1 de la tabla).
 * 15 entregadas (con fecha de entrega), 10 abiertas (2 bloqueadas, 1 sin asignar).
 */
const ISSUES: Issue[] = [
  open(0, { summary: 'Arregla login', assigneeRaw: 'Ana García', status: 'Bloqueado', macro: 'bloqueada', ageHours: 40 * 24 }),
  issue(1, { status: 'Finalizada' }),
  open(2, { status: 'Por hacer', macro: 'pendiente', assigneeRaw: null, ageHours: 3 * 24 }),
  open(3, { status: 'En curso', ageHours: 10 * 24 }),
  open(4, { status: 'Bloqueado', macro: 'bloqueada', ageHours: 2 * 24 }),
  ...Array.from({ length: 14 }, (_, k) => issue(5 + k)),
  ...Array.from({ length: 6 }, (_, k) => open(19 + k)),
];

const STATUS_STATS = [
  { status: 'Por hacer', n: 5, mean: 48, max: 96, openN: 1, openMean: 40 * 24 },
  { status: 'En curso', n: 12, mean: 72, max: 200, openN: 7, openMean: 10 * 24 },
  { status: 'Bloqueado', n: 2, mean: 30, max: 50, openN: 2, openMean: 3 * 24 },
  { status: 'Finalizada', n: 15, mean: null, max: null, openN: 0, openMean: null },
];

const DAYS_BY_STATE_TYPE = {
  Tarea: { 'En curso': { media: 48, max: 96, n: 10 }, Bloqueado: { media: 24, max: 24, n: 1 } },
  Historia: { 'En curso': { media: 72, max: 120, n: 5 } },
};

const DATA = {
  statuses: ['Por hacer', 'En curso', 'Bloqueado', 'Finalizada'],
  statusStats: STATUS_STATS,
  daysByStateType: DAYS_BY_STATE_TYPE,
  issues: ISSUES,
};

function stubFetch(body: unknown = DATA, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  );
}

async function renderPage() {
  const utils = render(<Jira />);
  await screen.findByRole('heading', { level: 1, name: 'Entrega' });
  return utils;
}

const sections = (c: HTMLElement) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];
const sectionByTitle = (c: HTMLElement, title: string) =>
  sections(c).find((d) => d.querySelector('summary h3')?.textContent === title)!;

function toggle(details: HTMLDetailsElement, isOpen: boolean) {
  details.open = isOpen;
  fireEvent(details, new Event('toggle'));
}

describe('Entrega (/jira) · diseño de /github', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    stubFetch();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('esqueleto de carga mientras no hay datos', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const { container } = render(<Jira />);
    const main = container.querySelector('main[aria-busy="true"]')!;
    expect(main).toBeTruthy();
    expect(main.getAttribute('aria-label')).toBe('Cargando entrega');
    expect(main.querySelector('.sk-kpis')).toBeTruthy();
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('mantiene el mensaje de error si la API falla', async () => {
    stubFetch({ error: 'x' }, 500);
    render(<Jira />);
    expect(await screen.findByText('No se pudieron cargar los datos de entrega.')).toBeTruthy();
  });

  it('PageShell: main ancho con cabecera, entradilla e Imprimir / PDF', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main')!;
    expect(main.classList.contains('page')).toBe(true);
    expect(main.classList.contains('jira')).toBe(true);
    const head = main.querySelector('.cr-head')!;
    expect(within(head as HTMLElement).getByRole('heading', { level: 1 }).textContent).toBe('Entrega');
    expect(head.querySelector('.lead')!.textContent).toBe('Ritmo de entrega y tiempos por estado, a partir de Jira.');
    expect(within(head as HTMLElement).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
  });

  it('KPIs agrupados en Volumen y Riesgo; Bloqueadas con borde rojo', async () => {
    const { container } = await renderPage();
    const groups = [...container.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Volumen', 'Riesgo']);
    const kpis = (g: Element) => [...g.querySelectorAll('.kpi')].map((k) => [k.querySelector('.l')!.textContent, k.querySelector('.v')!.textContent]);
    expect(kpis(groups[0]!)).toEqual([
      ['Issues en periodo', '25'],
      ['Entregadas', '15'],
      ['Abiertas', '10'],
    ]);
    expect(kpis(groups[1]!)).toEqual([['Bloqueadas', '2']]);
    const blocked = groups[1]!.querySelector('.kpi')!;
    expect(blocked.className).toBe('kpi kpi-edge-red');
    expect(blocked.getAttribute('title')).toBeTruthy();
    // Sin serie semanal de la API no se inventan deltas.
    expect(container.querySelector('.kpi-delta')).toBeNull();
  });

  it('orden: Resumen → gráfica de entregas → secciones plegables con contador', async () => {
    const { container } = await renderPage();
    const kpis = container.querySelector('.kpi-group')!;
    const chart = container.querySelector('.cr-chart')!;
    const first = sections(container)[0]!;
    expect(chart).toBeTruthy();
    expect(kpis.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chart.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const ds = sections(container);
    expect(ds.map((d) => d.querySelector('summary h3')!.textContent)).toEqual([
      'Tiempo medio por estado',
      'Días por estado y tipo',
      'Issues',
    ]);
    expect(ds.map((d) => d.querySelector('summary .count')!.textContent)).toEqual(['4', '2', '25']);
    // Por tipo es el bloque secundario: cerrado por defecto.
    expect(ds.map((d) => d.open)).toEqual([true, false, true]);
  });

  it('la nota del ciclo de desarrollo va en la sección de tiempos por estado', async () => {
    const { container } = await renderPage();
    const note = sectionByTitle(container, 'Tiempo medio por estado').querySelector('.cr-sec-body .q')!;
    expect(note.textContent).toContain('Ciclo de desarrollo (En curso → entregado)');
  });

  it('recuerda secciones abiertas/cerradas en devboard.jira.sections', async () => {
    localStorage.setItem('devboard.jira.sections', JSON.stringify({ byType: true, issues: false }));
    const { container } = await renderPage();
    expect(sections(container).map((d) => d.open)).toEqual([true, true, false]);
    toggle(sectionByTitle(container, 'Tiempo medio por estado'), false);
    expect(JSON.parse(localStorage.getItem('devboard.jira.sections')!)).toEqual({ byType: true, issues: false, statuses: false });
  });

  it('Tiempo medio por estado: tabla moderna en el orden del flujo, pills y badge de antigüedad', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Tiempo medio por estado');
    expect(sec.querySelector('table.ft-modern')).toBeTruthy();
    const heads = [...sec.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Estado', 'Días medios', 'Días máx.', 'Abiertas ahora', 'Media abiertas']);
    const rows = [...sec.querySelectorAll('tbody tr')];
    expect(rows.map((r) => [r.querySelector('.st-pill')!.textContent, r.querySelector('.st-pill')!.className])).toEqual([
      ['Por hacer', 'st-pill st-muted'],
      ['En curso', 'st-pill st-accent'],
      ['Bloqueado', 'st-pill st-warn'],
      ['Finalizada', 'st-pill st-ok'],
    ]);
    const badges = rows.map((r) => r.querySelector('.age-badge'));
    expect(badges.slice(0, 3).map((b) => [b!.textContent, b!.className])).toEqual([
      ['40 d', 'age-badge age-old'],
      ['10.0 d', 'age-badge age-mid'],
      ['3.0 d', 'age-badge age-new'],
    ]);
    // Sin abiertas no hay badge: guion.
    expect(badges[3]).toBeNull();
    expect(rows[3]!.lastElementChild!.textContent).toBe('—');
    // Los tiempos medios siguen en el formato de siempre.
    expect(rows[0]!.children[1]!.textContent).toBe('2.0 d');
  });

  it('Días por estado y tipo: una tabla moderna por tipo (orden alfabético) con pills', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Días por estado y tipo');
    expect([...sec.querySelectorAll('h4')].map((h) => h.textContent)).toEqual(['Historia', 'Tarea']);
    expect(sec.querySelectorAll('table.ft-modern')).toHaveLength(2);
    expect([...sec.querySelectorAll('tbody .st-pill')].map((p) => p.textContent)).toEqual(['En curso', 'En curso', 'Bloqueado']);
  });

  it('Issues: tabla moderna con búsqueda, filtros en pill y 20/50/100/Todas', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Issues');
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(20);
    fireEvent.change(within(sec).getByLabelText('Filas por página'), { target: { value: '0' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(25);
    for (const label of ['Tipo', 'Estado', 'Macro', 'Épica', 'Persona']) {
      expect(within(sec).getByLabelText(label).tagName).toBe('SELECT');
    }
    fireEvent.change(within(sec).getByLabelText('Buscar'), { target: { value: 'Arregla login' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('Issues: pills de estado, avatar, resumen con ellipsis y antigüedad solo en abiertas', async () => {
    const { container } = await renderPage();
    const sec = sectionByTitle(container, 'Issues');
    const heads = [...sec.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toContain('Antigüedad');
    const rows = [...sec.querySelectorAll('tbody tr')];

    const blocked = rows[0]!;
    expect(blocked.querySelector('.st-pill')!.className).toBe('st-pill st-warn');
    expect(blocked.querySelector('.st-pill')!.textContent).toBe('Bloqueado');
    expect(blocked.querySelector('.author-cell .avatar')!.textContent).toBe('AG');
    expect(blocked.querySelector('.author-cell')!.textContent).toContain('Ana García');
    const title = blocked.querySelector('td.td-title')!;
    expect(title.textContent).toBe('Arregla login');
    expect(title.getAttribute('title')).toBe('Arregla login');
    const age = blocked.querySelector('.age-badge')!;
    expect([age.textContent, age.className]).toEqual(['40 d', 'age-badge age-old']);

    const delivered = rows[1]!;
    expect(delivered.querySelector('.st-pill')!.className).toBe('st-pill st-ok');
    expect(delivered.querySelector('.age-badge')).toBeNull();

    const unassigned = rows[2]!;
    expect(unassigned.querySelector('.st-pill')!.className).toBe('st-pill st-muted');
    expect(unassigned.querySelector('.avatar')).toBeNull();
    expect(unassigned.textContent).toContain('(sin asignar)');
  });
});

describe('Entrega · gráfica de entregas (TimeSeriesChart)', () => {
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

  it('por defecto: barras, semana, 12 meses, total de entregadas', async () => {
    stubFetch();
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Entregas por semana' })).toBeTruthy();
    const labels = screen.getByTestId('bar-chart').dataset.labels!.split('|');
    expect(labels[0]).toBe('2025-W45');
    expect(labels[labels.length - 1]).toBe('2026-W45');
    expect(screen.getByText('15 entregadas')).toBeTruthy();
    expect((screen.getByLabelText('Rango') as HTMLSelectElement).value).toBe('12m');
  });

  it('solo cuenta issues hechas con fecha de entrega', async () => {
    stubFetch({
      ...DATA,
      issues: [
        issue(0),
        issue(1),
        open(2, { deliveredAt: iso(3) }), // entregada en Jira pero aún no «done»: no cuenta
        issue(3, { deliveredAt: null }), // done sin fecha: no cuenta
      ],
    });
    await renderPage();
    expect(screen.getByText('2 entregadas')).toBeTruthy();
  });

  it('cambiar tipo y granularidad cambia el título y se guarda en devboard.jira.chart', async () => {
    stubFetch();
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    expect(screen.getByRole('heading', { name: 'Entregas por mes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Línea' }));
    expect(screen.getByTestId('line-chart')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('devboard.jira.chart')!)).toMatchObject({ granularity: 'month', type: 'line' });
  });

  it('aplica las preferencias guardadas', async () => {
    localStorage.setItem('devboard.jira.chart', JSON.stringify({ type: 'line', granularity: 'year', preset: 'all' }));
    stubFetch();
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Entregas por año' })).toBeTruthy();
    expect(screen.getByTestId('line-chart').dataset.labels).toBe('2026');
  });

  it('elegir una fecha pasa el rango a Personalizado', async () => {
    stubFetch();
    await renderPage();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    expect((screen.getByLabelText('Rango') as HTMLSelectElement).value).toBe('custom');
  });
});

describe('Entrega · estados vacíos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    stubFetch({ statuses: [], statusStats: [], daysByStateType: {}, issues: [] });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('cada bloque sin filas muestra un EmptyState específico y la gráfica su texto vacío', async () => {
    const { container } = await renderPage();
    expect(sections(container).map((d) => d.querySelector('summary .count')!.textContent)).toEqual(['0', '0', '0']);
    const empty = (title: string) => sectionByTitle(container, title).querySelector('.empty-state')?.textContent;
    expect(empty('Tiempo medio por estado')).toBe('No hay tiempos por estado todavía.');
    expect(empty('Días por estado y tipo')).toBe('No hay datos por tipo de issue.');
    expect(empty('Issues')).toBe('No hay issues en el periodo.');
    expect(sectionByTitle(container, 'Issues').querySelector('table')).toBeNull();
    expect(container.querySelector('.cr-chart .cr-total')!.textContent).toBe('0 entregadas');
    const blocked = [...container.querySelectorAll('.kpi')].find((k) => k.querySelector('.l')!.textContent === 'Bloqueadas')!;
    expect(blocked.className).toBe('kpi');
  });
});
