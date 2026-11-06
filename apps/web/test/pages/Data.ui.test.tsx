// @vitest-environment jsdom
/**
 * Contrato UI de /data (Datos) con el kit de /github: PageShell, KPIs agrupados, dos secciones
 * plegables con tabla moderna (buscador, filtros en píldora, Filas por página), StatusPill,
 * Avatar, esqueleto de carga y estados vacíos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Data } from '../../src/pages/Data';

const NOW = new Date('2026-11-06T12:00:00Z');
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

function issue(i: number, extra: Record<string, unknown> = {}) {
  return {
    key: `MAIN-${i + 1}`,
    type: 'Historia',
    summary: `Tarea ${i + 1}`,
    status: 'Done',
    macro: 'entregada',
    assigneeRaw: 'alice',
    epicKey: 'MAIN-100',
    created: iso(i + 1),
    ...extra,
  };
}

function pr(i: number, extra: Record<string, unknown> = {}) {
  return {
    repo: 'org/app',
    number: i + 1,
    title: `Cambio ${i + 1}`,
    url: `https://example.test/org/app/pull/${i + 1}`,
    author: 'alice',
    state: 'mergeada',
    created: iso(i + 2),
    merged: iso(i + 1),
    ...extra,
  };
}

/** 25 issues: 22 entregadas de alice, 1 bloqueada de bob, 1 en curso sin asignar, 1 bug de login. */
const ISSUES = [
  ...Array.from({ length: 22 }, (_, i) => issue(i)),
  issue(22, { status: 'Blocked', macro: 'bloqueada', assigneeRaw: 'bob', type: 'Bug' }),
  issue(23, { status: 'In Progress', macro: 'en_marcha', assigneeRaw: null }),
  issue(24, { status: 'To Do', macro: 'pendiente', summary: 'Arregla login', assigneeRaw: 'Ana García' }),
];

const PRS = [
  pr(0),
  pr(1, { state: 'abierta', merged: null, author: 'bob', repo: 'org/api' }),
  pr(2, { state: 'borrador', merged: null }),
  pr(3, { state: 'cerrada sin merge', merged: null }),
];

function stub(issues: unknown[] = ISSUES, prs: unknown[] = PRS) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/data/issues') ? { items: issues } : url.endsWith('/api/data/prs') ? { items: prs } : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
}

async function renderPage() {
  const utils = render(<Data />);
  await screen.findByRole('heading', { level: 1, name: 'Datos' });
  return utils;
}

const sections = (c: HTMLElement) => [...c.querySelectorAll('details')] as HTMLDetailsElement[];
const pillLabels = (el: Element) => [...el.querySelectorAll('select.pill')].map((s) => s.getAttribute('aria-label'));

describe('Datos — diseño /github', () => {
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

  it('usa PageShell: main.page ancho, cabecera con título, entradilla e Imprimir / PDF', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main')!;
    expect(main.classList.contains('page')).toBe(true);
    expect(main.querySelector('.cr-head h1')!.textContent).toBe('Datos');
    expect(main.querySelector('.cr-head .lead')!.textContent).toBe(
      'Listados crudos de issues y PRs con todos los filtros disponibles.',
    );
    expect(within(main.querySelector('.cr-head') as HTMLElement).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
  });

  it('esqueleto mientras carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(<Data />);
    const main = container.querySelector('main[aria-busy="true"]')!;
    expect(main).toBeTruthy();
    expect(main.getAttribute('aria-label')).toBe('Cargando datos');
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('KPIs agrupados en Jira y GitHub', async () => {
    const { container } = await renderPage();
    const groups = [...container.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Jira', 'GitHub']);
    const kpis = (g: Element) => [...g.querySelectorAll('.kpi')].map((k) => [k.querySelector('.l')!.textContent, k.querySelector('.v')!.textContent]);
    // Abiertas = macro distinto de entregada/cerrada; Sin asignar = assigneeRaw null.
    expect(kpis(groups[0]!)).toEqual([
      ['Issues', '25'],
      ['Abiertas', '3'],
      ['Sin asignar', '1'],
    ]);
    // Abiertas = abierta + borrador.
    expect(kpis(groups[1]!)).toEqual([
      ['PRs', '4'],
      ['Abiertas', '2'],
      ['Mergeadas', '1'],
    ]);
    expect(container.querySelector('.kpi-delta')).toBeNull();
  });

  it('dos secciones plegables con contador, abiertas por defecto', async () => {
    const { container } = await renderPage();
    const ds = sections(container);
    expect(ds.map((d) => d.querySelector('summary h3')!.textContent)).toEqual(['Issues de Jira', 'Pull requests de GitHub']);
    expect(ds.map((d) => d.querySelector('summary .count')!.textContent)).toEqual(['25', '4']);
    expect(ds.map((d) => d.open)).toEqual([true, true]);
  });

  it('recuerda el estado de las secciones en devboard.data.sections', async () => {
    localStorage.setItem('devboard.data.sections', JSON.stringify({ prs: false }));
    const { container } = await renderPage();
    const [issues, prs] = sections(container);
    expect([issues!.open, prs!.open]).toEqual([true, false]);
    issues!.open = false;
    fireEvent(issues!, new Event('toggle'));
    expect(JSON.parse(localStorage.getItem('devboard.data.sections')!)).toEqual({ prs: false, issues: false });
  });

  it('tabla de issues moderna: buscador, filtros por Tipo/Estado/Macro/Persona y Filas por página', async () => {
    const { container } = await renderPage();
    const sec = sections(container)[0]!;
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    expect(sec.querySelector('table.ft-modern')).toBeTruthy();
    expect(pillLabels(sec)).toEqual(['Tipo', 'Estado', 'Macro', 'Persona']);
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(20);
    fireEvent.change(within(sec).getByLabelText('Filas por página'), { target: { value: '0' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(25);

    fireEvent.change(within(sec).getByLabelText('Persona'), { target: { value: 'bob' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(sec.querySelector('.cnt')!.textContent).toBe('1 filas');
    fireEvent.change(within(sec).getByLabelText('Persona'), { target: { value: '' } });

    fireEvent.change(within(sec).getByLabelText('Buscar'), { target: { value: 'login' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(sec.querySelector('tbody tr')!.textContent).toContain('Arregla login');
  });

  it('issues: estado como StatusPill (macro → color, estado real como texto), Avatar y resumen con tooltip', async () => {
    const { container } = await renderPage();
    const sec = sections(container)[0]!;
    fireEvent.change(within(sec).getByLabelText('Filas por página'), { target: { value: '0' } });
    const rows = [...sec.querySelectorAll('tbody tr')];
    const pillOf = (key: string) => {
      const row = rows.find((r) => r.querySelector('td')!.textContent === key)!;
      const p = row.querySelector('.st-pill')!;
      return [p.textContent, p.className];
    };
    expect(pillOf('MAIN-1')).toEqual(['Done', 'st-pill st-ok']);
    expect(pillOf('MAIN-23')).toEqual(['Blocked', 'st-pill st-warn']);
    expect(pillOf('MAIN-24')).toEqual(['In Progress', 'st-pill st-accent']);
    expect(pillOf('MAIN-25')).toEqual(['To Do', 'st-pill st-muted']);

    const login = rows.find((r) => r.textContent!.includes('Arregla login'))!;
    expect(login.querySelector('.avatar')!.textContent).toBe('AG');
    expect(login.querySelector('td.td-title')!.getAttribute('title')).toBe('Arregla login');

    const unassigned = rows.find((r) => r.querySelector('td')!.textContent === 'MAIN-24')!;
    expect(unassigned.querySelector('.avatar')).toBeNull();
    expect(unassigned.textContent).toContain('(sin asignar)');
  });

  it('tabla de PRs moderna: filtros por Repo/Autor/Estado, StatusPill, Avatar y PR enlazada', async () => {
    const { container } = await renderPage();
    const sec = sections(container)[1]!;
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    expect(within(sec).getByLabelText('Filas por página')).toBeTruthy();
    expect(pillLabels(sec)).toEqual(['Repo', 'Autor', 'Estado']);
    const pills = [...sec.querySelectorAll('tbody .st-pill')].map((p) => [p.textContent, p.className]);
    expect(pills).toEqual([
      ['mergeada', 'st-pill st-merged'],
      ['abierta', 'st-pill st-open'],
      ['borrador', 'st-pill st-draft'],
      ['cerrada sin merge', 'st-pill st-closed'],
    ]);
    expect([...sec.querySelectorAll('tbody .avatar')].map((a) => a.textContent)).toEqual(['AL', 'BO', 'AL', 'AL']);
    const link = sec.querySelector('tbody a[href="https://example.test/org/app/pull/1"]')!;
    expect(link.textContent).toBe('#1');
    fireEvent.change(within(sec).getByLabelText('Repo'), { target: { value: 'org/api' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(1);
    // Sin fecha de merge: «—» con tooltip explicativo, como en /github.
    fireEvent.change(within(sec).getByLabelText('Repo'), { target: { value: '' } });
    const titles = [...sec.querySelectorAll('tbody span.muted[title]')].map((s) => s.getAttribute('title'));
    expect(titles).toEqual(['Aún no mergeada', 'Aún no mergeada', 'Cerrada sin merge']);
  });

  it('estados vacíos específicos por tabla', async () => {
    stub([], []);
    const { container } = await renderPage();
    const [issues, prs] = sections(container);
    expect(issues!.querySelector('.empty-state')!.textContent).toBe('No hay issues de Jira.');
    expect(prs!.querySelector('.empty-state')!.textContent).toBe('No hay pull requests de GitHub.');
    expect(container.querySelector('table')).toBeNull();
  });

  it('error de carga: mensaje de error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    render(<Data />);
    expect((await screen.findByText('No se pudieron cargar los datos crudos.')).className).toBe('error-msg');
  });
});
