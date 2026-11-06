// @vitest-environment jsdom
/**
 * Contrato UI de /skills con el kit de /github: PageShell (acciones de TL en la cabecera),
 * KPIs agrupados de cobertura, secciones plegables por área (Perfiles, Competencias, Stack,
 * Dominio, Riesgo bus factor) recordadas en `devboard.skills.sections`, matriz de niveles 0–3
 * legible con leyenda, buscador de skills, avatares, esqueleto y estados vacíos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Skills } from '../../src/pages/Skills';

const SKILLS = {
  skills: [
    { id: 1, name: 'Testing', category: 'competency', description: null, sortOrder: 1, active: true },
    { id: 2, name: 'TypeScript', category: 'stack', description: null, sortOrder: 1, active: true },
    { id: 4, name: 'React', category: 'stack', description: 'Front', sortOrder: 2, active: true },
    { id: 3, name: 'Pagos', category: 'domain', description: null, sortOrder: 1, active: true },
    { id: 5, name: 'Legacy', category: 'domain', description: null, sortOrder: 2, active: false },
  ],
  people: [
    { id: 11, name: 'Bruno', seniority: null, role: null },
    { id: 10, name: 'Ana García', seniority: 'senior', role: 'Referente de testing' },
  ],
  profiles: [
    { personId: 10, shape: 'specialist', contribution: 'guardian', role: 'Referente de testing', roleSource: 'manual', summary: 'Ana es especialista.' },
    { personId: 11, shape: 'learning', contribution: 'occasional', role: 'Perfil en formación', roleSource: 'suggested', summary: 'Bruno está en formación.' },
  ],
  matrix: [
    { personId: 10, skillId: 1, level: 3, source: 'manual', evidence: 'Lidera los tests' },
    { personId: 11, skillId: 1, level: 2, source: 'manual', evidence: null },
    { personId: 10, skillId: 2, level: 2, source: 'auto', evidence: null },
    { personId: 11, skillId: 2, level: 1, source: 'auto', evidence: null },
    { personId: 10, skillId: 4, level: 2, source: 'auto', evidence: null },
    { personId: 11, skillId: 4, level: 2, source: 'auto', evidence: null },
  ],
  coverage: [
    { skillId: 1, count2plus: 2, count3: 1, busFactor: 2, risk: 'green' },
    { skillId: 2, count2plus: 1, count3: 0, busFactor: 1, risk: 'amber' },
    { skillId: 4, count2plus: 2, count3: 0, busFactor: 2, risk: 'green' },
    { skillId: 3, count2plus: 0, count3: 0, busFactor: 0, risk: 'red' },
    // Inactiva: no cuenta en KPIs ni en riesgo.
    { skillId: 5, count2plus: 0, count3: 0, busFactor: 0, risk: 'red' },
  ],
};

function stub(body: unknown = SKILLS, role = 'viewer') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const res = url.endsWith('/api/skills') ? body : url.endsWith('/api/auth/me') ? { role } : {};
      return new Response(JSON.stringify(res), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
}

async function renderPage() {
  const utils = render(<Skills />);
  await screen.findByRole('heading', { level: 1, name: 'Skills' });
  return utils;
}

const sections = (c: HTMLElement) => [...c.querySelectorAll('details')] as HTMLDetailsElement[];
const byTitle = (c: HTMLElement, t: string) => sections(c).find((d) => d.querySelector('summary h3')!.textContent === t)!;
const skillRows = (sec: Element) => [...sec.querySelectorAll('tbody td.skill-name')].map((td) => td.textContent);

describe('Skills — diseño /github', () => {
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
    expect(main.querySelector('.cr-head h1')!.textContent).toBe('Skills');
    expect(main.querySelector('.cr-head .lead')!.textContent).toBe(
      'Mapa de competencias, stack y dominio del equipo. Nivel 0–3 por persona y cobertura por skill.',
    );
    expect(within(main.querySelector('.cr-head') as HTMLElement).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Recalcular dominio' })).toBeNull();
  });

  it('TL: «Recalcular dominio» en las acciones de la cabecera y celdas editables', async () => {
    stub(SKILLS, 'tl');
    const { container } = await renderPage();
    const actions = await vi.waitFor(() => {
      const a = container.querySelector('.cr-head .cr-actions') as HTMLElement | null;
      if (!a) throw new Error('sin acciones');
      return a;
    });
    expect(within(actions).getByRole('button', { name: 'Recalcular dominio' })).toBeTruthy();
    expect(within(actions).getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ana García · Testing: nivel 3' })).toBeTruthy();
  });

  it('esqueleto mientras carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { container } = render(<Skills />);
    expect(container.querySelector('main[aria-busy="true"]')!.getAttribute('aria-label')).toBe('Cargando skills');
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('KPIs agrupados en Equipo y Cobertura (solo skills activas; bordes ámbar/rojo con riesgo)', async () => {
    const { container } = await renderPage();
    const groups = [...container.querySelectorAll('.kpi-group')];
    expect(groups.map((g) => g.querySelector('.kpi-group-label')!.textContent)).toEqual(['Equipo', 'Cobertura']);
    const kpis = (g: Element) =>
      [...g.querySelectorAll('.kpi')].map((k) => [k.querySelector('.l')!.textContent, k.querySelector('.v')!.textContent, k.className]);
    expect(kpis(groups[0]!)).toEqual([
      ['Personas', '2', 'kpi'],
      ['Skills activas', '4', 'kpi'],
    ]);
    expect(kpis(groups[1]!)).toEqual([
      ['Cubiertas (≥2)', '2', 'kpi'],
      ['En ámbar', '1', 'kpi kpi-edge-amber'],
      ['En rojo', '1', 'kpi kpi-edge-red'],
    ]);
  });

  it('secciones por área con contador, en orden', async () => {
    const { container } = await renderPage();
    const ds = sections(container);
    expect(ds.map((d) => d.querySelector('summary h3')!.textContent)).toEqual([
      'Perfiles',
      'Competencias',
      'Stack',
      'Dominio',
      'Riesgo bus factor',
    ]);
    expect(ds.map((d) => d.querySelector('summary .count')!.textContent)).toEqual(['2', '1', '2', '1', '2']);
    expect(ds.map((d) => d.open)).toEqual([true, true, true, true, true]);
  });

  it('recuerda secciones en devboard.skills.sections', async () => {
    localStorage.setItem('devboard.skills.sections', JSON.stringify({ profiles: false, domain: false }));
    const { container } = await renderPage();
    expect(sections(container).map((d) => d.open)).toEqual([false, true, true, false, true]);
    const stack = byTitle(container, 'Stack');
    stack.open = false;
    fireEvent(stack, new Event('toggle'));
    expect(JSON.parse(localStorage.getItem('devboard.skills.sections')!)).toEqual({ profiles: false, domain: false, stack: false });
  });

  it('matriz legible: personas ordenadas, celdas de nivel, cobertura y leyenda 0–3', async () => {
    const { container } = await renderPage();
    const stack = byTitle(container, 'Stack');
    const table = stack.querySelector('table.skills-matrix')!;
    expect([...table.querySelectorAll('thead th.person-col')].map((th) => th.textContent)).toEqual(['Ana García', 'Bruno']);
    expect(skillRows(stack)).toEqual(['TypeScript', 'React']);
    const ts = table.querySelector('tbody tr')!;
    expect([...ts.querySelectorAll('.lvl')].map((l) => l.className)).toEqual(['lvl lvl-2', 'lvl lvl-1']);
    expect(screen.getByTestId('coverage-2').className).toContain('risk-amber');

    const legend = container.querySelector('.skills-legend')!;
    expect([...legend.querySelectorAll('.lvl')].map((l) => l.className)).toEqual(['lvl lvl-0', 'lvl lvl-1', 'lvl lvl-2', 'lvl lvl-3']);
    expect(legend.textContent).toContain('≥2');
  });

  it('buscador de skills filtra las filas de todas las matrices', async () => {
    const { container } = await renderPage();
    fireEvent.change(screen.getByLabelText('Buscar skill'), { target: { value: 'type' } });
    expect(skillRows(byTitle(container, 'Stack'))).toEqual(['TypeScript']);
    expect(skillRows(byTitle(container, 'Competencias'))).toEqual([]);
    expect(byTitle(container, 'Competencias').querySelector('.empty-state')!.textContent).toBe('Ninguna skill coincide con la búsqueda.');
    fireEvent.change(screen.getByLabelText('Buscar skill'), { target: { value: '' } });
    expect(skillRows(byTitle(container, 'Competencias'))).toEqual(['Testing']);
  });

  it('Perfiles: avatar, chips de forma y contribución, y resumen', async () => {
    await renderPage();
    const ana = screen.getByTestId('profile-10');
    expect(ana.querySelector('.avatar')!.textContent).toBe('AG');
    expect(ana.textContent).toContain('Especialista');
    expect(ana.textContent).toContain('Guardián');
    expect(ana.textContent).toContain('Ana es especialista.');
    expect(screen.getByTestId('profile-11').querySelector('.avatar')!.textContent).toBe('BR');
  });

  it('Riesgo bus factor: rojas primero, sin inactivas', async () => {
    const { container } = await renderPage();
    const items = [...byTitle(container, 'Riesgo bus factor').querySelectorAll('li')];
    expect(items.map((li) => li.className)).toEqual(['risk-red', 'risk-amber']);
    expect(items[0]!.textContent).toContain('Pagos');
    expect(items[1]!.textContent).toContain('TypeScript');
  });

  it('estados vacíos: categoría sin skills y sin riesgos', async () => {
    stub({
      ...SKILLS,
      skills: SKILLS.skills.filter((s) => s.category !== 'domain'),
      coverage: SKILLS.coverage.filter((c) => c.risk === 'green'),
    });
    const { container } = await renderPage();
    expect(byTitle(container, 'Dominio').querySelector('summary .count')!.textContent).toBe('0');
    expect(byTitle(container, 'Dominio').querySelector('.empty-state')!.textContent).toBe('Sin skills en esta categoría.');
    expect(byTitle(container, 'Riesgo bus factor').querySelector('.empty-state')!.textContent).toBe('Sin riesgos detectados.');
  });
});
