// @vitest-environment jsdom
/**
 * Contrato de la migración de /team al kit de /github (pageKey `team`):
 * cabecera PageShell (Exportar Excel + Imprimir), medianas como KpiGroups, ranking en tabla
 * moderna con avatares y semáforos, y resúmenes como una sección plegable por persona
 * (cerradas por defecto, estado recordado, buscador de persona).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Team } from '../../src/pages/Team';

type Sem = 'g' | 'a' | 'r' | '';

function rankRow(i: number, name: string, slug: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    slug,
    delivered: 10 + i,
    prsMerged: 5 + i,
    reviews: 20 - i,
    ratio: 1.5,
    ratioColor: 'g' as Sem,
    changesRequested: 2,
    authorsReviewed: 3,
    responseH: 6,
    responseColor: 'g' as Sem,
    firstReviewH: 30,
    firstReviewColor: 'a' as Sem,
    noApproval: 0,
    noApprovalColor: 'g' as Sem,
    open7d: 0,
    open7dColor: '' as Sem,
    blocked: 0,
    blockedColor: '' as Sem,
    cycleDays: 2.5,
    ...extra,
  };
}

function kpis(blocked = 0) {
  const k = (label: string, value: number | string | null, sub: string, color: Sem = '') => ({ label, value, sub, color });
  return [
    k('Entregadas', 12, '5 en 4 sem'),
    k('PRs mergeadas', 9, '4 en 4 sem · 0 hotfix'),
    k('Reviews hechas', 20, 'en 15 PRs · pide cambios 2'),
    k('Responde a una PR en', '6.0 h', 'media', 'g'),
    k('Sus PRs: 1ª review', '1.3 d', 'media', 'a'),
    k('Sus PRs: merge', '2.0 d', 'media'),
    k('Sin aprobación', 0, 'PRs mergeadas sin approve', 'g'),
    k('Bloqueadas / atención', `${blocked} / 1`, 'ahora', blocked ? 'r' : ''),
    k('Días para entregar', 2.5, 'media'),
  ];
}

const MEDIANS = {
  delivered: 11,
  reviews: 19,
  ratio: 1.5,
  responseH: 6,
  firstReviewH: 36,
  cycleDays: 2.5,
  prsMerged: 6,
  authorsReviewed: 3,
};

const ROWS = [
  rankRow(0, 'Alice Doe', 'alice', { blocked: 2, blockedColor: 'r' }),
  rankRow(1, 'Bob Roe', 'bob'),
  ...Array.from({ length: 22 }, (_, i) => rankRow(i + 2, `Dev ${String(i + 1).padStart(2, '0')}`, `dev-${i + 1}`)),
];

const SUMMARIES = [
  { name: 'Bob Roe', slug: 'bob', kpis: kpis() },
  { name: 'Alice Doe', slug: 'alice', kpis: kpis(2) },
  { name: 'Carol Poe', slug: 'carol', kpis: kpis() },
];

const DATA = { rank: { rows: ROWS, medians: MEDIANS }, medians: MEDIANS, summaries: SUMMARIES };

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
}

async function renderPage() {
  const utils = render(
    <MemoryRouter>
      <Team />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Team' });
  return utils;
}

const sections = (c: ParentNode) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];
const title = (d: Element) => d.querySelector(':scope > summary h3')!.textContent;
const sectionOf = (c: ParentNode, t: string) => sections(c).find((d) => title(d) === t)!;
/** Secciones de persona dentro de «Resúmenes por persona». */
const personSections = (c: HTMLElement) => sections(sectionOf(c, 'Resúmenes por persona'));

function toggle(details: HTMLDetailsElement, open: boolean) {
  details.open = open;
  fireEvent(details, new Event('toggle'));
}

describe('Team (UI kit)', () => {
  beforeEach(() => {
    localStorage.clear();
    stubFetch(DATA);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('muestra un esqueleto mientras carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(
      <MemoryRouter>
        <Team />
      </MemoryRouter>,
    );
    const main = container.querySelector('main.page[aria-busy="true"]')!;
    expect(main).toBeTruthy();
    expect(main.getAttribute('aria-label')).toBe('Cargando equipo');
  });

  it('PageShell: título, entradilla y acciones Exportar Excel + Imprimir en la cabecera', async () => {
    const { container } = await renderPage();
    const head = container.querySelector('main.page .cr-head')!;
    expect(head.querySelector('h1')!.textContent).toBe('Team');
    expect(head.querySelector('.lead')!.textContent).toBe('Ranking del equipo por reviews hechas, con semáforos por columna.');
    const actions = head.querySelector('.cr-actions')!;
    expect(within(actions as HTMLElement).getByRole('link', { name: 'Exportar Excel' }).getAttribute('href')).toBe('/api/export/team.xlsx');
    expect(within(actions as HTMLElement).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Imprimir / PDF' })).toHaveLength(1);
  });

  it('orden: Medianas del equipo → Ranking → Resúmenes por persona', async () => {
    const { container } = await renderPage();
    const tops = [...container.querySelectorAll('main.page > section > h2, main.page > details.cr-sec > summary h3')].map(
      (h) => h.textContent,
    );
    expect(tops).toEqual(['Medianas del equipo', 'Ranking', 'Resúmenes por persona']);
    // La lista <ul> antigua de medianas desaparece.
    expect(container.querySelector('ul.small')).toBeNull();
  });

  it('medianas como KPIs agrupados en Entrega y Code review', async () => {
    const { container } = await renderPage();
    const block = [...container.querySelectorAll('main.page > section')].find((s) => s.querySelector('h2')!.textContent === 'Medianas del equipo')!;
    const groups = [...block.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Entrega', 'Code review']);
    expect([...groups[0]!.querySelectorAll('.kpi .l')].map((l) => l.textContent)).toEqual(['Entregadas', 'PRs mergeadas', 'Días de ciclo']);
    expect([...groups[0]!.querySelectorAll('.kpi .v')].map((l) => l.textContent)).toEqual(['11', '6', '2.5']);
    expect([...groups[1]!.querySelectorAll('.kpi .l')].map((l) => l.textContent)).toEqual([
      'Reviews',
      'Balance review',
      'Autores revisados',
      'Respuesta',
      '1ª review',
    ]);
    expect([...groups[1]!.querySelectorAll('.kpi .v')].map((l) => l.textContent)).toEqual(['19', '1.5', '3', '6.0 h', '1.5 d']);
  });

  it('Ranking: sección con contador y tabla moderna paginada (20/50/100/Todas)', async () => {
    const { container } = await renderPage();
    const rank = sectionOf(container, 'Ranking');
    expect(rank.open).toBe(true);
    expect(rank.querySelector('summary .count')!.textContent).toBe('24');
    expect(rank.querySelector('.fbar-modern')).toBeTruthy();
    expect(rank.querySelector('table.ft-modern')).toBeTruthy();
    expect(rank.querySelectorAll('tbody tr')).toHaveLength(20);
    fireEvent.change(within(rank).getByLabelText('Filas por página'), { target: { value: '0' } });
    expect(rank.querySelectorAll('tbody tr')).toHaveLength(24);
  });

  it('Ranking: búsqueda por persona', async () => {
    const { container } = await renderPage();
    const rank = sectionOf(container, 'Ranking');
    fireEvent.change(within(rank).getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'alice' } });
    expect(rank.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('Ranking: persona con avatar de iniciales y enlace a su detalle; semáforos conservados', async () => {
    const { container } = await renderPage();
    const rank = sectionOf(container, 'Ranking');
    const first = rank.querySelector('tbody tr')!;
    expect(first.querySelector('.avatar')!.textContent).toBe('AD');
    expect(within(first as HTMLElement).getByRole('link', { name: /Alice Doe/ }).getAttribute('href')).toBe('/team/alice');
    expect(first.querySelector('.rag-dot.red')).toBeTruthy();
    expect(first.querySelector('.rag-dot.amber')).toBeTruthy();
  });

  it('Resúmenes: una sección por persona, ordenadas por nombre y cerradas por defecto', async () => {
    const { container } = await renderPage();
    const outer = sectionOf(container, 'Resúmenes por persona');
    expect(outer.querySelector(':scope > summary .count')!.textContent).toBe('3');
    expect(personSections(container).map(title)).toEqual(['Alice Doe', 'Bob Roe', 'Carol Poe']);
    expect(personSections(container).map((d) => d.open)).toEqual([false, false, false]);
    // Sin la rejilla antigua de tarjetas.
    expect(container.querySelector('.grid > .card > h4')).toBeNull();
  });

  it('cada resumen: avatar, enlace «Ver detalle» y KPIs agrupados en Entrega y Code review', async () => {
    const { container } = await renderPage();
    const alice = personSections(container)[0]!;
    expect(alice.querySelector('.avatar')!.textContent).toBe('AD');
    expect(within(alice).getByRole('link', { name: 'Ver detalle' }).getAttribute('href')).toBe('/team/alice');
    const groups = [...alice.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Entrega', 'Code review']);
    expect([...groups[0]!.querySelectorAll('.kpi .l')].map((l) => l.textContent)).toEqual([
      'Entregadas',
      'Bloqueadas / atención',
      'Días para entregar',
    ]);
    expect([...groups[1]!.querySelectorAll('.kpi .l')].map((l) => l.textContent)).toEqual([
      'PRs mergeadas',
      'Reviews hechas',
      'Responde a una PR en',
      'Sus PRs: 1ª review',
      'Sus PRs: merge',
      'Sin aprobación',
    ]);
    // Semáforo de la API conservado en los KPIs.
    const blocked = [...alice.querySelectorAll('.kpi')].find((k) => k.querySelector('.l')!.textContent === 'Bloqueadas / atención')!;
    expect(blocked.className).toContain('rag-red');
    expect(blocked.querySelector('.v')!.textContent).toBe('2 / 1');
  });

  it('recuerda personas abiertas en devboard.team.sections (id person-<slug>)', async () => {
    localStorage.setItem('devboard.team.sections', JSON.stringify({ 'person-bob': true, rank: false }));
    const { container } = await renderPage();
    expect(sectionOf(container, 'Ranking').open).toBe(false);
    expect(personSections(container).map((d) => d.open)).toEqual([false, true, false]);
    toggle(personSections(container)[2]!, true);
    expect(JSON.parse(localStorage.getItem('devboard.team.sections')!)).toEqual({ 'person-bob': true, rank: false, 'person-carol': true });
  });

  it('Resúmenes: buscador de persona con recuento y estado vacío', async () => {
    const { container } = await renderPage();
    const outer = sectionOf(container, 'Resúmenes por persona');
    const search = within(outer).getByRole('searchbox', { name: 'Buscar persona' });
    fireEvent.change(search, { target: { value: 'car' } });
    expect(personSections(container).map(title)).toEqual(['Carol Poe']);
    expect(within(outer).getByText('1 persona')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(personSections(container)).toHaveLength(0);
    expect(outer.querySelector('.empty-state')!.textContent).toBe('Ninguna persona coincide con la búsqueda.');
  });

  it('botones Abrir todas / Cerrar todas en los resúmenes', async () => {
    const { container } = await renderPage();
    const outer = sectionOf(container, 'Resúmenes por persona');
    fireEvent.click(within(outer).getByRole('button', { name: 'Abrir todas' }));
    expect(personSections(container).map((d) => d.open)).toEqual([true, true, true]);
    fireEvent.click(within(outer).getByRole('button', { name: 'Cerrar todas' }));
    expect(personSections(container).map((d) => d.open)).toEqual([false, false, false]);
  });

  it('equipo vacío: estados vacíos específicos', async () => {
    stubFetch({ rank: { rows: [], medians: MEDIANS }, medians: MEDIANS, summaries: [] });
    const { container } = await renderPage();
    expect(sectionOf(container, 'Ranking').querySelector('.empty-state')!.textContent).toBe('No hay personas en el ranking.');
    expect(sectionOf(container, 'Resúmenes por persona').querySelector('.empty-state')!.textContent).toBe(
      'No hay resúmenes de personas.',
    );
  });

  it('error de carga: mensaje de error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    render(
      <MemoryRouter>
        <Team />
      </MemoryRouter>,
    );
    expect((await screen.findByText('No se pudieron cargar los datos del equipo.')).className).toBe('error-msg');
  });
});
