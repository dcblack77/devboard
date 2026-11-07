// @vitest-environment jsdom
/**
 * Contrato UI de /initiatives (lista) con el kit de /github: PageShell, KPIs agrupados con
 * semáforo, una sección plegable con tabla moderna (buscador, filtro por estado RAG,
 * Filas por página), barra de avance, avatares y estados de carga/vacío.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Initiatives } from '../../src/pages/Initiatives';

const LIST = [
  {
    name: 'Pagos',
    slug: 'pagos',
    childrenTotal: 10,
    pctDone: 80,
    open: 2,
    done: 8,
    blockedNow: 0,
    people: [
      { dev: 'alice', total: 6, open: 1, done: 5 },
      { dev: 'bob', total: 4, open: 1, done: 3 },
    ],
    rag: { color: 'g', reason: 'Avanza a buen ritmo' },
  },
  {
    name: 'Login',
    slug: 'login',
    childrenTotal: 5,
    pctDone: 40,
    open: 3,
    done: 2,
    blockedNow: 1,
    people: [{ dev: 'Ana García', total: 5, open: 3, done: 2 }],
    rag: { color: 'a', reason: 'Hay bloqueos' },
  },
  {
    name: 'Migración',
    slug: 'migracion',
    childrenTotal: 0,
    pctDone: 0,
    open: 0,
    done: 0,
    blockedNow: 0,
    people: [],
    rag: { color: 'r', reason: 'Sin avance' },
  },
];

function stub(initiatives: unknown[] = LIST) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ initiatives }), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
}

function renderList() {
  return render(
    <MemoryRouter>
      <Initiatives />
    </MemoryRouter>,
  );
}

async function renderPage() {
  const utils = renderList();
  await screen.findByRole('heading', { level: 1, name: 'Iniciativas' });
  return utils;
}

const listSection = (c: HTMLElement) => c.querySelector('details')! as HTMLDetailsElement;
/** Nombre de la iniciativa de una fila (enlace al detalle; la primera columna ahora es «Clave»). */
const nameOf = (r: Element) => r.querySelector('a[href^="/initiatives/"]')!.textContent;
const rowOf = (sec: Element, name: string) => [...sec.querySelectorAll('tbody tr')].find((r) => nameOf(r) === name)!;

describe('Iniciativas — diseño /github', () => {
  beforeEach(() => {
    localStorage.clear();
    stub();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('usa PageShell con título, entradilla e Imprimir / PDF', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main')!;
    expect(main.classList.contains('page')).toBe(true);
    expect(main.querySelector('.cr-head h1')!.textContent).toBe('Iniciativas');
    expect(main.querySelector('.cr-head .lead')!.textContent).toBe('Agrupación de épicas para el seguimiento de negocio.');
    expect(screen.getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
  });

  it('esqueleto mientras carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = renderList();
    expect(container.querySelector('main[aria-busy="true"]')!.getAttribute('aria-label')).toBe('Cargando iniciativas');
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('KPIs agrupados: Semáforo (con color) y Avance (bloqueados en rojo si > 0)', async () => {
    const { container } = await renderPage();
    const groups = [...container.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Semáforo', 'Avance']);
    const kpis = (g: Element) =>
      [...g.querySelectorAll('.kpi')].map((k) => [k.querySelector('.l')!.textContent, k.querySelector('.v')!.textContent, k.className]);
    expect(kpis(groups[0]!)).toEqual([
      ['En verde', '1', 'kpi rag-green'],
      ['En ámbar', '1', 'kpi rag-amber'],
      ['En rojo', '1', 'kpi rag-red'],
    ]);
    expect(kpis(groups[1]!)).toEqual([
      ['Iniciativas', '3', 'kpi'],
      ['Elementos', '15', 'kpi'],
      ['Bloqueados', '1', 'kpi kpi-edge-red'],
    ]);
  });

  it('sección plegable «Iniciativas» con contador y estado recordado en devboard.initiatives.sections', async () => {
    const { container } = await renderPage();
    const sec = listSection(container);
    expect(sec.querySelector('summary h3')!.textContent).toBe('Iniciativas');
    expect(sec.querySelector('summary .count')!.textContent).toBe('3');
    expect(sec.open).toBe(true);
    sec.open = false;
    fireEvent(sec, new Event('toggle'));
    expect(JSON.parse(localStorage.getItem('devboard.initiatives.sections')!)).toEqual({ list: false });
  });

  it('respeta el estado guardado', async () => {
    localStorage.setItem('devboard.initiatives.sections', JSON.stringify({ list: false }));
    const { container } = await renderPage();
    expect(listSection(container).open).toBe(false);
  });

  it('tabla moderna con columnas, enlace al detalle, barra de avance y avatares', async () => {
    const { container } = await renderPage();
    const sec = listSection(container);
    expect(sec.querySelector('.fbar-modern')).toBeTruthy();
    expect(within(sec).getByLabelText('Filas por página')).toBeTruthy();
    expect([...sec.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Clave',
      'Iniciativa',
      'Estado',
      'Plazo',
      'Inicio',
      'Fin estimado',
      'Avance',
      'Estimación',
      'Elementos',
      'Abiertos',
      'Entregados',
      'Bloqueados',
      'Motivo',
      'Personas',
    ]);
    const pagos = rowOf(sec, 'Pagos');
    expect(pagos.querySelector('a')!.getAttribute('href')).toBe('/initiatives/pagos');
    expect(pagos.querySelector('.rag-dot.green')).toBeTruthy();
    expect(pagos.textContent).toContain('Verde');
    expect(pagos.textContent).toContain('80%');
    expect((pagos.querySelector('.init-bar > span') as HTMLElement).style.width).toBe('80%');
    expect([...pagos.querySelectorAll('.avatar')].map((a) => a.textContent)).toEqual(['AL', 'BO']);
    const motivo = [...pagos.querySelectorAll('td.td-title')].find((td) => td.textContent === 'Avanza a buen ritmo');
    expect(motivo!.getAttribute('title')).toBe('Avanza a buen ritmo');

    const login = rowOf(sec, 'Login');
    expect(login.querySelector('.rag-dot.amber')).toBeTruthy();
    expect([...login.querySelectorAll('.avatar')].map((a) => a.textContent)).toEqual(['AG']);
    expect(rowOf(sec, 'Migración').querySelector('.avatar')).toBeNull();
  });

  it('filtro por Estado (Verde/Ámbar/Rojo) y buscador', async () => {
    const { container } = await renderPage();
    const sec = listSection(container);
    const estado = within(sec).getByLabelText('Estado') as HTMLSelectElement;
    expect([...estado.options].map((o) => o.value)).toEqual(['', 'Verde', 'Ámbar', 'Rojo']);
    fireEvent.change(estado, { target: { value: 'Rojo' } });
    expect([...sec.querySelectorAll('tbody tr')].map(nameOf)).toEqual(['Migración']);
    fireEvent.change(estado, { target: { value: '' } });
    fireEvent.change(within(sec).getByLabelText('Buscar'), { target: { value: 'login' } });
    expect([...sec.querySelectorAll('tbody tr')].map(nameOf)).toEqual(['Login']);
  });

  it('estado vacío', async () => {
    stub([]);
    const { container } = await renderPage();
    const sec = listSection(container);
    expect(sec.querySelector('summary .count')!.textContent).toBe('0');
    expect(sec.querySelector('.empty-state')!.textContent).toBe('No hay iniciativas configuradas.');
    expect(sec.querySelector('table')).toBeNull();
  });
});
