// @vitest-environment jsdom
/**
 * Contrato de la migración del detalle de persona (`/team/:slug`, componente compartido
 * `PersonDetail`, también usado por `/me/:slug`) al kit de /github (pageKey `person`):
 * PageShell con «Versión para compartir» + Imprimir, KPIs agrupados, secciones plegables con
 * contador, tablas modernas con StatusPill, gráfica configurable de entregadas por fecha real
 * de entrega (`devStat.issues[].deliveredAt`, ya presente en la API) y bloque de skills.
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

import { TeamPerson } from '../../src/pages/TeamPerson';
import { Me } from '../../src/pages/Me';

const DAY = 86_400_000;
const NOW = new Date('2026-11-06T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

function issue(i: number, extra: Record<string, unknown> = {}) {
  return {
    key: `APP-${i}`,
    type: i % 2 ? 'Bug' : 'Historia',
    summary: `Tarea ${i}`,
    status: 'Done',
    macro: 'entregada',
    done: true,
    counted: true,
    created: ago(i * 5 + 10),
    deliveredAt: ago(i * 5 + 1),
    inStatusHours: 10,
    ...extra,
  };
}

// 22 entregadas (fechas de 1 a 106 días atrás) + 2 abiertas (no cuentan en la gráfica).
const DONE = Array.from({ length: 22 }, (_, i) => issue(i));
const OPEN = [
  issue(30, { status: 'En curso', macro: 'en_marcha', done: false, deliveredAt: null }),
  issue(31, { status: 'Bloqueado', macro: 'bloqueada', done: false, deliveredAt: null }),
];

const KPI = (label: string, value: number | string | null, sub: string, color = '') => ({ label, value, sub, color });

const DETAIL = {
  metrics: { name: 'Alice Doe', slug: 'alice' },
  summary: {
    kpis: [
      KPI('Entregadas', 22, '5 en 4 sem'),
      KPI('PRs mergeadas', 9, '4 en 4 sem · 0 hotfix'),
      KPI('Reviews hechas', 20, 'en 15 PRs · pide cambios 2'),
      KPI('Responde a una PR en', '6.0 h', 'media', 'g'),
      KPI('Sus PRs: 1ª review', '1.3 d', 'media', 'a'),
      KPI('Sus PRs: merge', '2.0 d', 'media'),
      KPI('Sin aprobación', 1, 'PRs mergeadas sin approve', 'r'),
      KPI('Bloqueadas / atención', '1 / 1', 'ahora', 'r'),
      KPI('Días para entregar', 2.5, 'media'),
    ],
    profile: [
      { label: 'Balance review', value: 2.2, sub: 'reviews ÷ PRs propias', comparedToMedian: 'por encima de la mediana (1.5)' },
      { label: 'Alcance de review', value: 3, sub: 'autores distintos revisados', comparedToMedian: 'en la mediana' },
      { label: 'Mezcla de trabajo', value: 'Historia', sub: 'Historia 50% · Bug 50%', comparedToMedian: '' },
    ],
  },
  devStat: {
    dev: 'Alice Doe',
    slug: 'alice',
    total: 24,
    open: 2,
    done: 22,
    active: 1,
    blockedNow: 1,
    throughput4w: 5,
    cycleMean: 60,
    cycleMax: 200,
    leadMean: 90,
    byStatus: {},
    byType: { Historia: 12, Bug: 12 },
    daysByStateType: {
      Historia: { 'En curso': { media: 30, max: 50, n: 4 }, 'In Review': { media: 10, max: 20, n: 4 } },
      Bug: { 'En curso': { media: 12, max: 24, n: 3 } },
    },
    weekly: [{ week: '2026-W44', completedByType: { Bug: 1 }, completed: 1 }],
    attention: [
      { key: 'APP-31', type: 'Bug', summary: 'Login roto en móvil', status: 'Bloqueado', macro: 'bloqueada', inStatusHours: 200, why: ['bloqueada', 'parada 8 d'] },
    ],
    epics: [
      {
        key: 'APP-100',
        summary: 'Pagos',
        status: 'En curso',
        childrenTotal: 10,
        childrenByMacro: { entregada: 4 },
        pctDone: 40,
        mine: [{ key: 'APP-1', type: 'Bug', status: 'Done', summary: 'Tarea 1' }],
      },
    ],
    issues: [...OPEN, ...DONE],
  },
};

const SKILLS = {
  person: { id: 1, name: 'Alice Doe', seniority: null, role: null },
  skills: [
    { id: 1, name: 'React', category: 'stack', description: null, sortOrder: 1, active: true },
    { id: 2, name: 'Comunicación', category: 'competency', description: null, sortOrder: 2, active: true },
  ],
  rows: [
    { personId: 1, skillId: 1, level: 3, source: 'auto', evidence: null },
    { personId: 1, skillId: 2, level: 2, source: 'manual', evidence: null },
  ],
  soleOwnerOf: [1],
  profile: {
    personId: 1,
    shape: 'specialist',
    contribution: 'builder',
    suggestedRole: null,
    role: 'Frontend',
    roleSource: 'manual',
    referentIn: [{ skillId: 1, name: 'React', level: 3 }],
    soleReferentIn: [{ skillId: 1, name: 'React', level: 3 }],
    domainTop: [],
    gaps: [],
    summary: 'Referente de React.',
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stubFetch({ detail = DETAIL as unknown, skills = SKILLS as unknown | null } = {}) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/skills')) return skills ? json(skills) : json({ error: 'x' }, 500);
    if (url.includes('/api/team/') || url.includes('/api/me/')) return json(detail);
    return json({ jiraBrowseUrl: null, prsByIssue: {} });
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/team/:slug" element={<TeamPerson />} />
        <Route path="/me/:slug" element={<Me />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderPage(path = '/team/alice') {
  const utils = renderAt(path);
  await screen.findByRole('heading', { level: 1, name: 'Alice Doe' });
  return utils;
}

const sections = (c: ParentNode) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];
const title = (d: Element) => d.querySelector(':scope > summary h3')!.textContent;
const sectionOf = (c: ParentNode, t: string) => sections(c).find((d) => title(d) === t)!;

function toggle(details: HTMLDetailsElement, open: boolean) {
  details.open = open;
  fireEvent(details, new Event('toggle'));
}

describe('TeamPerson (UI kit)', () => {
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

  it('muestra un esqueleto mientras carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = renderAt('/team/alice');
    const main = container.querySelector('main.page[aria-busy="true"]')!;
    expect(main).toBeTruthy();
    expect(main.getAttribute('aria-label')).toBe('Cargando persona');
  });

  it('PageShell: nombre como título, avatar y acciones «Versión para compartir» + Imprimir (uno solo)', async () => {
    const { container } = await renderPage();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    const head = container.querySelector('main.page .cr-head')!;
    expect(head.querySelector('h1')!.textContent).toContain('Alice Doe');
    expect(head.querySelector('h1 .avatar')!.textContent).toBe('AD');
    expect(head.querySelector('.lead')).toBeTruthy();
    const actions = head.querySelector('.cr-actions') as HTMLElement;
    const share = within(actions).getByRole('link', { name: 'Versión para compartir' });
    expect(share.getAttribute('href')).toBe('/me/alice');
    expect(within(actions).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Imprimir / PDF' })).toHaveLength(1);
  });

  it('KPIs agrupados en Entrega, Code review y Perfil', async () => {
    const { container } = await renderPage();
    const groups = [...container.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Entrega', 'Code review', 'Perfil']);
    const labels = (i: number) => [...groups[i]!.querySelectorAll('.kpi .l')].map((l) => l.textContent);
    expect(labels(0)).toEqual(['Entregadas', 'Bloqueadas / atención', 'Días para entregar']);
    expect(labels(1)).toEqual([
      'PRs mergeadas',
      'Reviews hechas',
      'Responde a una PR en',
      'Sus PRs: 1ª review',
      'Sus PRs: merge',
      'Sin aprobación',
    ]);
    expect(labels(2)).toEqual(['Balance review', 'Alcance de review', 'Mezcla de trabajo']);
    // Semáforos de la API conservados; la comparación con la mediana sigue en el subtexto.
    const noAppr = [...groups[1]!.querySelectorAll('.kpi')].find((k) => k.querySelector('.l')!.textContent === 'Sin aprobación')!;
    expect(noAppr.className).toContain('rag-red');
    expect(groups[2]!.querySelector('.kpi .s')!.textContent).toBe('reviews ÷ PRs propias · por encima de la mediana (1.5)');
  });

  it('secciones plegables con contador en orden; Detalle de issues cerrada por defecto', async () => {
    const { container } = await renderPage();
    const top = sections(container).filter((d) => d.parentElement?.closest('details') === null);
    expect(top.map(title)).toEqual([
      'Requiere atención',
      'Flujo por estado',
      'Iniciativas / épicas',
      'Detalle de issues',
      'Skills y dominio',
    ]);
    expect(top.map((d) => d.querySelector(':scope > summary .count')?.textContent ?? null)).toEqual(['1', '2', '1', '24', null]);
    expect(top.map((d) => d.open)).toEqual([true, true, true, false, true]);
  });

  it('recuerda secciones en devboard.person.sections (compartido entre personas)', async () => {
    localStorage.setItem('devboard.person.sections', JSON.stringify({ issues: true, flow: false }));
    const { container } = await renderPage();
    expect(sectionOf(container, 'Detalle de issues').open).toBe(true);
    expect(sectionOf(container, 'Flujo por estado').open).toBe(false);
    toggle(sectionOf(container, 'Iniciativas / épicas'), false);
    expect(JSON.parse(localStorage.getItem('devboard.person.sections')!)).toEqual({ issues: true, flow: false, epics: false });
  });

  it('Requiere atención: tabla moderna con StatusPill y motivo', async () => {
    const { container } = await renderPage();
    const sec = sectionOf(container, 'Requiere atención');
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    const row = sec.querySelector('tbody tr')!;
    const pill = row.querySelector('.st-pill')!;
    expect(pill.textContent).toBe('Bloqueado');
    expect(pill.className).toContain('st-warn');
    expect(row.textContent).toContain('bloqueada; parada 8 d');
  });

  it('Requiere atención vacía: estado vacío en lugar de ocultar la sección', async () => {
    stubFetch({ detail: { ...DETAIL, devStat: { ...DETAIL.devStat, attention: [] } } });
    const { container } = await renderPage();
    const sec = sectionOf(container, 'Requiere atención');
    expect(sec.querySelector('summary .count')!.textContent).toBe('0');
    expect(sec.querySelector('.empty-state')!.textContent).toBe('Nada requiere atención ahora mismo 🎉');
  });

  it('Flujo por estado: una tabla moderna por tipo', async () => {
    const { container } = await renderPage();
    const sec = sectionOf(container, 'Flujo por estado');
    const tables = [...sec.querySelectorAll('table.ft-modern')];
    expect(tables).toHaveLength(2);
    expect([...sec.querySelectorAll('h4')].map((h) => h.textContent)).toEqual(['Historia', 'Bug']);
    expect(tables[0]!.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('Detalle de issues: tabla moderna paginada con filtros de tipo/estado y StatusPill', async () => {
    const { container } = await renderPage();
    const sec = sectionOf(container, 'Detalle de issues');
    toggle(sec, true);
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(20);
    fireEvent.change(within(sec).getByLabelText('Filas por página'), { target: { value: '0' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(24);
    expect(within(sec).getByRole('combobox', { name: 'Tipo' })).toBeTruthy();
    expect(within(sec).getByRole('combobox', { name: 'Estado' })).toBeTruthy();
    expect(sec.querySelector('tbody .st-pill')).toBeTruthy();
    fireEvent.change(within(sec).getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'APP-30' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('gráfica configurable de entregadas por fecha real de entrega (barras, semana, 3 meses)', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Entregadas por semana' })).toBeTruthy();
    expect(screen.getByTestId('bar-chart')).toBeTruthy();
    expect((screen.getByLabelText('Rango') as HTMLSelectElement).value).toBe('3m');
    // Solo cuentan las entregadas (deliveredAt) dentro del rango: 1..91 días atrás → 19.
    expect(screen.getByText('19 entregadas')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Rango'), { target: { value: 'all' } });
    expect(screen.getByText('22 entregadas')).toBeTruthy();
  });

  it('la gráfica guarda sus preferencias en devboard.person.chart', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Línea' }));
    expect(screen.getByRole('heading', { name: 'Entregadas por mes' })).toBeTruthy();
    expect(screen.getByTestId('line-chart')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('devboard.person.chart')!)).toMatchObject({ granularity: 'month', type: 'line' });
  });

  it('Skills y dominio: sección con perfil, niveles y único referente', async () => {
    const { container } = await renderPage();
    const sec = await vi.waitFor(() => {
      const s = sectionOf(container, 'Skills y dominio');
      if (!s) throw new Error('sin skills todavía');
      return s;
    });
    expect(sec.textContent).toContain('Referente de React.');
    expect(sec.textContent).toContain('Único referente en:');
    expect(sec.querySelectorAll('.lvl')).toHaveLength(2);
  });

  it('si fallan las skills, la página se muestra sin esa sección', async () => {
    stubFetch({ skills: null });
    const { container } = await renderPage();
    expect(sections(container).map(title)).not.toContain('Skills y dominio');
  });

  it('sin devStat: solo KPIs y estado vacío de actividad', async () => {
    stubFetch({ detail: { metrics: DETAIL.metrics, summary: DETAIL.summary }, skills: null });
    const { container } = await renderPage();
    expect(container.querySelectorAll('.kpi-group')).toHaveLength(3);
    expect(container.querySelector('.empty-state')!.textContent).toBe('Sin actividad de Jira para esta persona.');
  });

  it('error de carga: mensaje de error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'x' }, 404)));
    renderAt('/team/alice');
    expect((await screen.findByText('No se pudo cargar el detalle de esta persona.')).className).toBe('error-msg');
  });
});

describe('Me (vista para compartir, mismo PersonDetail)', () => {
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

  it('PageShell sin enlace de compartir y con un único Imprimir', async () => {
    const { container } = await renderPage('/me/alice');
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main.page .cr-head h1')!.textContent).toContain('Alice Doe');
    expect(screen.queryByRole('link', { name: 'Versión para compartir' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Imprimir / PDF' })).toHaveLength(1);
  });

  it('esqueleto mientras carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = renderAt('/me/alice');
    expect(container.querySelector('main.page[aria-busy="true"]')!.getAttribute('aria-label')).toBe('Cargando persona');
  });
});
