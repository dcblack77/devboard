// @vitest-environment jsdom
/**
 * Contrato de la migración de «Épicas» (/epics) al kit de /github (ver `.hermes/plans/ui-g2.md`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { Epics } from '../../src/pages/Epics';

interface Epic {
  key: string;
  summary: string;
  status: string;
  assigneeRaw: string | null;
  childrenTotal: number;
  childrenByMacro: Record<string, number>;
  pctDone: number;
}

function epic(i: number, extra: Partial<Epic> = {}): Epic {
  return {
    key: `MAIN-${100 + i}`,
    summary: `Épica ${i + 1}`,
    status: 'En curso',
    assigneeRaw: 'alice',
    childrenTotal: 10,
    childrenByMacro: { entregada: 5, en_marcha: 3, pendiente: 2 },
    pctDone: 50,
    ...extra,
  };
}

const EPICS: Epic[] = [
  epic(0, { summary: 'Nuevo onboarding de clientes', assigneeRaw: 'Ana García', pctDone: 75 }),
  epic(1, { status: 'Finalizada', pctDone: 100, childrenByMacro: { entregada: 10 } }),
  epic(2, { status: 'Por hacer', assigneeRaw: null, pctDone: 0, childrenTotal: 0, childrenByMacro: {} }),
  epic(3, { status: 'Bloqueado', pctDone: 33 }),
  ...Array.from({ length: 20 }, (_, k) => epic(4 + k)),
];

function stubFetch(body: unknown = { epics: EPICS }, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  );
}

async function renderPage() {
  const utils = render(<Epics />);
  await screen.findByRole('heading', { level: 1, name: 'Épicas' });
  return utils;
}

const sections = (c: HTMLElement) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];

describe('Épicas (/epics) · diseño de /github', () => {
  beforeEach(() => {
    localStorage.clear();
    stubFetch();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('esqueleto de carga mientras no hay datos', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const { container } = render(<Epics />);
    const main = container.querySelector('main[aria-busy="true"]')!;
    expect(main).toBeTruthy();
    expect(main.getAttribute('aria-label')).toBe('Cargando épicas');
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('mantiene el mensaje de error si la API falla', async () => {
    stubFetch({ error: 'x' }, 500);
    render(<Epics />);
    expect(await screen.findByText('No se pudieron cargar las épicas.')).toBeTruthy();
  });

  it('PageShell: main ancho con cabecera, entradilla e Imprimir / PDF', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main')!;
    expect(main.classList.contains('page')).toBe(true);
    expect(main.classList.contains('epics')).toBe(true);
    const head = main.querySelector('.cr-head')! as HTMLElement;
    expect(head.querySelector('.lead')!.textContent).toBe('Avance de todas las épicas de Jira, agrupen o no una iniciativa.');
    expect(within(head).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
  });

  it('KPIs de Avance: Épicas, Completadas, En curso y Avance medio', async () => {
    const { container } = await renderPage();
    const groups = [...container.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Avance']);
    const kpis = [...groups[0]!.querySelectorAll('.kpi')].map((k) => [k.querySelector('.l')!.textContent, k.querySelector('.v')!.textContent]);
    // 24 épicas; 1 al 100 %; 22 con avance entre 1 y 99 %; media (75+100+0+33+20·50)/24 = 50.3 → 50%.
    expect(kpis).toEqual([
      ['Épicas', '24'],
      ['Completadas', '1'],
      ['En curso', '22'],
      ['Avance medio', '50%'],
    ]);
    expect(container.querySelector('.kpi-delta')).toBeNull();
  });

  it('una sección «Épicas» plegable con contador, recordada en devboard.epics.sections', async () => {
    const { container } = await renderPage();
    const [sec, ...rest] = sections(container);
    expect(rest).toHaveLength(0);
    expect(sec!.querySelector('summary h3')!.textContent).toBe('Épicas');
    expect(sec!.querySelector('summary .count')!.textContent).toBe('24');
    expect(sec!.open).toBe(true);
    sec!.open = false;
    fireEvent(sec!, new Event('toggle'));
    expect(JSON.parse(localStorage.getItem('devboard.epics.sections')!)).toEqual({ epics: false });
  });

  it('respeta el estado guardado de la sección', async () => {
    localStorage.setItem('devboard.epics.sections', JSON.stringify({ epics: false }));
    const { container } = await renderPage();
    expect(sections(container)[0]!.open).toBe(false);
  });

  it('tabla moderna: búsqueda, filtros Estado/Responsable y 20/50/100/Todas', async () => {
    const { container } = await renderPage();
    const sec = sections(container)[0]!;
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    expect(sec.querySelector('table.ft-modern')).toBeTruthy();
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(20);
    fireEvent.change(within(sec).getByLabelText('Filas por página'), { target: { value: '0' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(24);
    expect(within(sec).getByLabelText('Estado').tagName).toBe('SELECT');
    expect(within(sec).getByLabelText('Responsable').tagName).toBe('SELECT');
    fireEvent.change(within(sec).getByLabelText('Buscar'), { target: { value: 'onboarding' } });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('columnas: pill de estado, responsable con avatar, resumen con ellipsis y barra de avance', async () => {
    const { container } = await renderPage();
    const sec = sections(container)[0]!;
    expect([...sec.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Clave',
      'Resumen',
      'Estado',
      'Responsable',
      'Elementos',
      '% avance',
    ]);
    const rows = [...sec.querySelectorAll('tbody tr')];
    expect(rows.slice(0, 4).map((r) => r.querySelector('.st-pill')!.className)).toEqual([
      'st-pill st-accent',
      'st-pill st-ok',
      'st-pill st-muted',
      'st-pill st-warn',
    ]);
    const first = rows[0]!;
    const title = first.querySelector('td.td-title')!;
    expect(title.textContent).toBe('Nuevo onboarding de clientes');
    expect(title.getAttribute('title')).toBe('Nuevo onboarding de clientes');
    expect(first.querySelector('.author-cell .avatar')!.textContent).toBe('AG');
    const bar = first.querySelector('.epics-progress')!;
    expect(bar.textContent).toContain('75%');
    expect((bar.querySelector('.repo-bar > span') as HTMLElement).style.width).toBe('75%');
    // Sin responsable: texto en gris, sin avatar.
    expect(rows[2]!.querySelector('.avatar')).toBeNull();
    expect(rows[2]!.textContent).toContain('(sin asignar)');
  });

  it('el título de la barra desglosa los hijos por macro-estado', async () => {
    const { container } = await renderPage();
    const bar = sections(container)[0]!.querySelector('tbody tr .epics-progress')!;
    expect(bar.getAttribute('title')).toBe('entregada: 5 · en_marcha: 3 · pendiente: 2');
  });

  it('sin épicas: EmptyState y contador 0', async () => {
    stubFetch({ epics: [] });
    const { container } = await renderPage();
    const sec = sections(container)[0]!;
    expect(sec.querySelector('summary .count')!.textContent).toBe('0');
    expect(sec.querySelector('.empty-state')!.textContent).toBe('No hay épicas en Jira.');
    expect(sec.querySelector('table')).toBeNull();
    const avg = [...container.querySelectorAll('.kpi')].find((k) => k.querySelector('.l')!.textContent === 'Avance medio')!;
    expect(avg.querySelector('.v')!.textContent).toBe('—');
  });
});
