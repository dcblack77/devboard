// @vitest-environment jsdom
/**
 * Contrato de la migración de /people (Personas) al kit de /github.
 * Una sección plegable por persona (pageKey `people`, id = slug) con avatar de iniciales y
 * KPIs agrupados en «Entrega» y «Code review»; buscador de persona; sin tablas ni ranking
 * (vista RRHH sin comparativas).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { People } from '../../src/pages/People';

function person(name: string, slug: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    slug,
    delivered: 12,
    delivered4w: 5,
    open: 3,
    blocked: 0,
    attention: 1,
    cycleMean: 48,
    prsMerged: 9,
    prs4w: 4,
    reviews: 20,
    prsReviewed: 15,
    ...extra,
  };
}

// Desordenadas a propósito: la página ordena por nombre.
const PEOPLE = [
  person('Carol Poe', 'carol'),
  person('Alice Doe', 'alice', { blocked: 2 }),
  person('Bob Roe', 'bob'),
];

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
}

async function renderPage() {
  const utils = render(<People />);
  await screen.findByRole('heading', { level: 1, name: 'Personas' });
  return utils;
}

const sections = (c: HTMLElement) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];
const titles = (c: HTMLElement) => sections(c).map((d) => d.querySelector('summary h3')!.textContent);
const sectionOf = (c: HTMLElement, title: string) => sections(c).find((d) => d.querySelector('summary h3')!.textContent === title)!;

function toggle(details: HTMLDetailsElement, open: boolean) {
  details.open = open;
  fireEvent(details, new Event('toggle'));
}

describe('People (UI kit)', () => {
  beforeEach(() => {
    localStorage.clear();
    stubFetch({ people: PEOPLE });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('muestra un esqueleto mientras carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(<People />);
    const main = container.querySelector('main.page[aria-busy="true"]')!;
    expect(main).toBeTruthy();
    expect(main.getAttribute('aria-label')).toBe('Cargando personas');
    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  it('usa PageShell: cabecera con título, entradilla y un único botón de imprimir', async () => {
    const { container } = await renderPage();
    const head = container.querySelector('main.page .cr-head')!;
    expect(head).toBeTruthy();
    expect(head.querySelector('h1')!.textContent).toBe('Personas');
    expect(head.querySelector('.lead')!.textContent).toBe('Vista individual en llano, sin comparaciones entre compañeros.');
    expect(screen.getAllByRole('button', { name: 'Imprimir / PDF' })).toHaveLength(1);
  });

  it('una sección plegable por persona, ordenadas por nombre y abiertas por defecto', async () => {
    const { container } = await renderPage();
    expect(titles(container)).toEqual(['Alice Doe', 'Bob Roe', 'Carol Poe']);
    expect(sections(container).map((d) => d.open)).toEqual([true, true, true]);
    // Sin la rejilla antigua de tarjetas sueltas.
    expect(container.querySelector('.grid > .card > h4')).toBeNull();
  });

  it('cada persona lleva avatar con iniciales', async () => {
    const { container } = await renderPage();
    expect(sections(container).map((d) => d.querySelector('.avatar')?.textContent)).toEqual(['AD', 'BR', 'CP']);
  });

  it('agrupa los KPIs de cada persona en Entrega y Code review', async () => {
    const { container } = await renderPage();
    const alice = sectionOf(container, 'Alice Doe');
    const groups = [...alice.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Entrega', 'Code review']);
    expect([...groups[0]!.querySelectorAll('.kpi .l')].map((l) => l.textContent)).toEqual([
      'Entregadas',
      'En curso',
      'Bloqueadas',
      'Días medios de entrega',
    ]);
    expect([...groups[1]!.querySelectorAll('.kpi .l')].map((l) => l.textContent)).toEqual(['PRs mergeadas', 'Reviews hechas']);
    // Valores y subtextos de siempre.
    expect([...groups[0]!.querySelectorAll('.kpi .v')].map((v) => v.textContent)).toEqual(['12', '3', '2', '2.0 d']);
    expect([...alice.querySelectorAll('.kpi .s')].map((s) => s.textContent)).toEqual(['5 en 4 sem.', '4 en 4 sem.', 'en 15 PRs']);
  });

  it('Bloqueadas > 0 se marca con borde rojo; a 0 no lleva borde', async () => {
    const { container } = await renderPage();
    const blockedKpi = (title: string) =>
      [...sectionOf(container, title).querySelectorAll('.kpi')].find((k) => k.querySelector('.l')!.textContent === 'Bloqueadas')!;
    expect(blockedKpi('Alice Doe').className).toContain('kpi-edge-red');
    expect(blockedKpi('Bob Roe').className).not.toContain('kpi-edge');
  });

  it('recuerda qué personas están plegadas en devboard.people.sections (id = slug)', async () => {
    localStorage.setItem('devboard.people.sections', JSON.stringify({ bob: false }));
    const { container } = await renderPage();
    expect(sections(container).map((d) => d.open)).toEqual([true, false, true]);
    toggle(sectionOf(container, 'Carol Poe'), false);
    expect(JSON.parse(localStorage.getItem('devboard.people.sections')!)).toEqual({ bob: false, carol: false });
  });

  it('buscador de persona: filtra secciones, muestra el recuento y estado vacío', async () => {
    const { container } = await renderPage();
    const search = screen.getByRole('searchbox', { name: 'Buscar persona' });
    expect(screen.getByText('3 personas')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'bob' } });
    expect(titles(container)).toEqual(['Bob Roe']);
    expect(screen.getByText('1 persona')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(titles(container)).toEqual([]);
    expect(container.querySelector('.empty-state')!.textContent).toBe('Ninguna persona coincide con la búsqueda.');
  });

  it('la búsqueda ignora mayúsculas y acentos', async () => {
    stubFetch({ people: [person('Ángela Ruiz', 'angela'), person('Bob Roe', 'bob')] });
    const { container } = await renderPage();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar persona' }), { target: { value: 'ANGELA' } });
    expect(titles(container)).toEqual(['Ángela Ruiz']);
  });

  it('sin comparativas: no hay tablas ni ranking en la vista RRHH', async () => {
    const { container } = await renderPage();
    expect(container.querySelector('table')).toBeNull();
  });

  it('estado vacío cuando no hay personas', async () => {
    stubFetch({ people: [] });
    const { container } = await renderPage();
    expect(sections(container)).toHaveLength(0);
    expect(container.querySelector('.empty-state')!.textContent).toBe('No hay personas con datos todavía.');
  });

  it('error de carga: mensaje de error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    render(<People />);
    expect((await screen.findByText('No se pudieron cargar los datos de personas.')).className).toBe('error-msg');
  });
});
