// @vitest-environment jsdom
/**
 * Contrato de la migración de Ajustes (/settings) al kit de /github (`components/ui`).
 * Es una página de formularios: PageShell, cada grupo en una `Section` (estado recordado en
 * `devboard.settings.sections`), tablas modernas en las listas, esqueleto y estados vacíos.
 * Guardado y validación NO cambian (los cubren `SettingsBoards.test.tsx` y `Settings.test.ts`).
 * Ver `.hermes/plans/ui-g5.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Settings } from '../../src/pages/Settings';

const SETTINGS = {
  id: 1,
  jiraBoards: [
    { key: 'MAIN', kind: 'dev', name: null },
    { key: 'SUP', kind: 'support', name: 'Soporte' },
  ],
  sinceDate: null,
  syncMinutes: 60,
  attentionDays: 5,
  reviewDays: 2,
  waitReviewHours: 24,
  thresholds: {},
  statusFlow: ['Por hacer', 'Hecho'],
  statusAliases: {},
  macroMap: {},
  countedTypes: [],
  hotfixRegex: null,
  deployWorkflow: 'deploy',
  deployBranches: 'main',
  ciWorkflowRegex: 'ci',
  featureBase: 'develop',
  supportTechStatus: null,
  supportSla: { Alta: { firstResponseHours: 4, resolutionHours: 48 } },
};

const person = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  jiraNames: [name.split(' ')[0]],
  githubLogins: [name.toLowerCase().split(' ')[0]],
  note: null,
  active: true,
  ...extra,
});

const PEOPLE = [person(1, 'Ana García'), person(2, 'Bob Smith', { active: false })];
const DISCOVER = { repos: [], epicsWithoutInitiative: [], unmappedJiraNames: ['Carol'], unmappedGithubLogins: ['dave', 'erin'] };
const SKILLS = {
  skills: [
    { id: 1, name: 'React', category: 'stack', description: null, sortOrder: 1, active: true },
    { id: 2, name: 'Comunicación', category: 'competency', description: 'Habla claro', sortOrder: 2, active: true },
    { id: 3, name: 'Pagos', category: 'domain', description: null, sortOrder: 3, active: true },
  ],
  people: [
    { id: 1, name: 'Ana García', seniority: 'senior', role: null },
    { id: 2, name: 'Bob Smith', seniority: null, role: 'Backend' },
  ],
  matrix: [],
  coverage: [],
  profiles: [],
};
const RUNS = {
  runs: [
    { id: 3, source: 'jira', startedAt: '2026-11-06T10:00:00Z', finishedAt: null, ok: null, error: null, counts: {} },
    { id: 2, source: 'github', startedAt: '2026-11-06T09:00:00Z', finishedAt: '2026-11-06T09:01:00Z', ok: true, error: null, counts: {} },
    { id: 1, source: 'jira', startedAt: '2026-11-06T08:00:00Z', finishedAt: '2026-11-06T08:01:00Z', ok: false, error: 'timeout', counts: {} },
  ],
  health: {},
};
const SNAPSHOTS = { snapshots: [{ id: 1, takenAt: '2026-11-01T00:00:00Z', kind: 'home' }] };
const INITIATIVES = {
  initiatives: [{ id: 1, name: 'Pagos', slug: 'pagos', position: 1, source: 'manual', epicKey: null, epicKeys: ['MAIN-1'] }],
};

type Routes = Partial<Record<string, unknown>>;

const DEFAULT_ROUTES: Routes = {
  '/api/settings': { settings: SETTINGS },
  '/api/settings/people': { people: PEOPLE },
  '/api/settings/discover': DISCOVER,
  '/api/skills': SKILLS,
  '/api/sync/status': RUNS,
  '/api/snapshots': SNAPSHOTS,
  '/api/settings/initiatives': INITIATIVES,
};

/** fetch por URL; `pending` = URLs que nunca responden (para ver el esqueleto). */
function stub(routes: Routes = {}, pending: string[] = []) {
  const all = { ...DEFAULT_ROUTES, ...routes };
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).split('?')[0]!;
    if (pending.includes(url)) return new Promise<Response>(() => undefined);
    const body = init?.method === 'PUT' && url === '/api/settings' ? { settings: { ...SETTINGS, ...JSON.parse(String(init.body)) } } : all[url] ?? {};
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

const sections = (c: HTMLElement) => [...c.querySelectorAll<HTMLDetailsElement>('details.cr-sec')];
const titles = (c: HTMLElement) => sections(c).map((d) => d.querySelector('summary h3')!.textContent);
const sectionByTitle = (c: HTMLElement, title: string) => {
  const d = sections(c).find((s) => s.querySelector('summary h3')!.textContent === title);
  if (!d) throw new Error(`Sección no encontrada: ${title}`);
  return d;
};

async function renderGeneral() {
  const utils = render(<Settings />);
  await screen.findByLabelText('Clave 1');
  return utils;
}

function goTab(label: string) {
  fireEvent.click(within(screen.getByRole('group', { name: 'Apartados' })).getByRole('button', { name: label }));
}

describe('Ajustes · UI kit', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('layout y pestañas', () => {
    it('PageShell sin botón de imprimir: main.page.settings con cabecera .cr-head', async () => {
      stub();
      const { container } = await renderGeneral();
      const main = container.querySelector('main.page.settings')!;
      expect(main).toBeTruthy();
      const head = main.querySelector('.cr-head') as HTMLElement;
      expect(within(head).getByRole('heading', { level: 1, name: 'Ajustes' })).toBeTruthy();
      expect(head.querySelector('.lead')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Imprimir / PDF' })).toBeNull();
    });

    it('pestañas como control segmentado con aria-pressed', async () => {
      stub();
      await renderGeneral();
      const group = screen.getByRole('group', { name: 'Apartados' });
      expect(group.className).toContain('sys-seg');
      const buttons = within(group).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual(['General', 'Personas', 'Iniciativas', 'Skills', 'Sincronización', 'Snapshots']);
      expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
      goTab('Personas');
      expect(within(group).getByRole('button', { name: 'Personas' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('recuerda la pestaña elegida (devboard.settings.tab)', async () => {
      stub();
      await renderGeneral();
      goTab('Skills');
      expect(localStorage.getItem('devboard.settings.tab')).toBe('skills');
      cleanup();
      render(<Settings />);
      expect(within(screen.getByRole('group', { name: 'Apartados' })).getByRole('button', { name: 'Skills' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('esqueleto mientras cargan los ajustes (sin «Cargando…»)', () => {
      stub({}, ['/api/settings']);
      const { container } = render(<Settings />);
      expect(screen.getByLabelText('Cargando ajustes').getAttribute('aria-busy')).toBe('true');
      expect(container.querySelector('.skeleton')).toBeTruthy();
      expect(screen.queryByText('Cargando…')).toBeNull();
      // El esqueleto va dentro del PageShell: la cabecera y las pestañas siguen visibles.
      expect(container.querySelector('main.page.settings .cr-head')).toBeTruthy();
      expect(screen.getByRole('group', { name: 'Apartados' })).toBeTruthy();
    });
  });

  describe('General', () => {
    it('cada grupo es una sección; las de JSON plegadas por defecto', async () => {
      stub();
      const { container } = await renderGeneral();
      expect(titles(container)).toEqual([
        'Tableros de Jira',
        'SLA de soporte',
        'Ventanas y plazos',
        'Sistema (DORA)',
        'Umbrales (JSON)',
        'Flujo de estados (JSON, lista)',
        'Alias de estado (JSON, objeto)',
        'Mapa de macro-estado (JSON, objeto)',
      ]);
      expect(sections(container).map((d) => d.open)).toEqual([true, true, true, true, false, false, false, false]);
    });

    it('contadores de Tableros y SLA siguen a las filas editadas', async () => {
      stub();
      const { container } = await renderGeneral();
      const count = (t: string) => sectionByTitle(container, t).querySelector('summary .count')!.textContent;
      expect(count('Tableros de Jira')).toBe('2');
      expect(count('SLA de soporte')).toBe('1');
      fireEvent.click(screen.getByRole('button', { name: '+ Añadir tablero' }));
      fireEvent.click(screen.getByRole('button', { name: 'Añadir prioridad' }));
      expect(count('Tableros de Jira')).toBe('3');
      expect(count('SLA de soporte')).toBe('2');
    });

    it('los editores de tableros y SLA usan la tabla moderna (sin paginar)', async () => {
      stub();
      const { container } = await renderGeneral();
      for (const t of ['Tableros de Jira', 'SLA de soporte']) {
        const s = sectionByTitle(container, t);
        expect(s.querySelector('table.ft-modern'), t).toBeTruthy();
        expect(within(s).queryByLabelText('Filas por página'), t).toBeNull();
      }
      expect(within(sectionByTitle(container, 'Tableros de Jira')).getByLabelText('Clave 2')).toBeTruthy();
      expect(within(sectionByTitle(container, 'SLA de soporte')).getByLabelText('Prioridad 1')).toBeTruthy();
    });

    it('el estado de las secciones se recuerda en devboard.settings.sections', async () => {
      localStorage.setItem('devboard.settings.sections', JSON.stringify({ boards: false, thresholds: true }));
      stub();
      const { container } = await renderGeneral();
      expect(sectionByTitle(container, 'Tableros de Jira').open).toBe(false);
      expect(sectionByTitle(container, 'Umbrales (JSON)').open).toBe(true);
      const sla = sectionByTitle(container, 'SLA de soporte');
      sla.open = false;
      fireEvent(sla, new Event('toggle'));
      expect(JSON.parse(localStorage.getItem('devboard.settings.sections')!)).toMatchObject({ boards: false, thresholds: true, sla: false });
    });

    it('Guardar sigue fuera de las secciones y guarda aunque estén plegadas', async () => {
      localStorage.setItem('devboard.settings.sections', JSON.stringify({ boards: false, sla: false }));
      const fn = stub();
      const { container } = await renderGeneral();
      const save = screen.getByRole('button', { name: 'Guardar' });
      expect(save.closest('details')).toBeNull();
      expect(save.closest('.form-actions')).toBeTruthy();
      fireEvent.click(save);
      await waitFor(() => expect(fn.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')).toBe(true));
      const put = fn.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')!;
      expect(JSON.parse(String((put[1] as RequestInit).body)).jiraBoards).toEqual([
        { key: 'MAIN', kind: 'dev', name: null },
        { key: 'SUP', kind: 'support', name: 'Soporte' },
      ]);
      await screen.findByText('Guardado correctamente.');
      expect(container.querySelector('main.page.settings')).toBeTruthy();
    });
  });

  describe('Personas', () => {
    async function open() {
      stub();
      const utils = await renderGeneral();
      goTab('Personas');
      await screen.findByDisplayValue('Ana García');
      return utils;
    }

    it('sección «Personas» con contador y tabla moderna con buscador y filtro Activo', async () => {
      const { container } = await open();
      const s = sectionByTitle(container, 'Personas');
      expect(s.querySelector('summary .count')!.textContent).toBe('2');
      expect(s.querySelector('table.ft-modern')).toBeTruthy();
      expect(within(s).getByLabelText('Filas por página')).toBeTruthy();
      expect(within(s).getByLabelText('Activo')).toBeTruthy();
      fireEvent.change(within(s).getByLabelText('Buscar'), { target: { value: 'bob' } });
      expect(s.querySelectorAll('tbody tr')).toHaveLength(1);
      expect(within(s).getByDisplayValue('Bob Smith')).toBeTruthy();
    });

    it('editar sigue llamando a la API (PUT /api/settings/people/:id)', async () => {
      const fn = stub();
      await renderGeneral();
      goTab('Personas');
      fireEvent.change(await screen.findByDisplayValue('Ana García'), { target: { value: 'Ana G.' } });
      await waitFor(() =>
        expect(fn.mock.calls.some((c) => String(c[0]) === '/api/settings/people/1' && (c[1] as RequestInit | undefined)?.method === 'PUT')).toBe(true),
      );
    });

    it('sección «Sin mapear» con contador de nombres y logins', async () => {
      const { container } = await open();
      const s = await waitFor(() => sectionByTitle(container, 'Sin mapear'));
      expect(s.querySelector('summary .count')!.textContent).toBe('3');
      expect(s.textContent).toContain('Carol');
      expect(s.textContent).toContain('dave, erin');
    });

    it('estado vacío y esqueleto', async () => {
      stub({ '/api/settings/people': { people: [] } });
      const { container } = await renderGeneral();
      goTab('Personas');
      await waitFor(() => expect(sectionByTitle(container, 'Personas').querySelector('.empty-state')!.textContent).toBe('No hay personas todavía.'));
      cleanup();
      localStorage.clear();
      stub({}, ['/api/settings/people']);
      const r = render(<Settings />);
      await screen.findByLabelText('Clave 1');
      goTab('Personas');
      const s = sectionByTitle(r.container, 'Personas');
      expect(s.querySelector('.skeleton')).toBeTruthy();
      expect(s.querySelector('.empty-state')).toBeNull();
    });
  });

  describe('Skills', () => {
    async function open() {
      stub();
      const utils = await renderGeneral();
      goTab('Skills');
      await screen.findByDisplayValue('React');
      return utils;
    }

    it('secciones Catálogo y Seniority y rol, con contadores (sin dominio)', async () => {
      const { container } = await open();
      expect(titles(container)).toEqual(['Catálogo', 'Seniority y rol']);
      expect(sectionByTitle(container, 'Catálogo').querySelector('summary .count')!.textContent).toBe('2');
      expect(sectionByTitle(container, 'Seniority y rol').querySelector('summary .count')!.textContent).toBe('2');
    });

    it('catálogo en tabla moderna con filtro de categoría', async () => {
      const { container } = await open();
      const s = sectionByTitle(container, 'Catálogo');
      expect(s.querySelector('table.ft-modern')).toBeTruthy();
      fireEvent.change(within(s).getByLabelText('Categoría'), { target: { value: 'Stack' } });
      expect(s.querySelectorAll('tbody tr')).toHaveLength(1);
      expect(within(s).getByDisplayValue('React')).toBeTruthy();
    });

    it('seniority y rol: tabla moderna con avatar y el rol se sigue guardando al salir del campo', async () => {
      const fn = stub();
      const { container } = await renderGeneral();
      goTab('Skills');
      await screen.findByDisplayValue('React');
      const s = sectionByTitle(container, 'Seniority y rol');
      expect(s.querySelector('table.ft-modern')).toBeTruthy();
      expect(s.querySelector('td.author-cell .avatar')!.textContent).toBe('AG');
      const role = within(s).getByLabelText('Rol de Ana García');
      fireEvent.change(role, { target: { value: 'Frontend' } });
      fireEvent.blur(role);
      await waitFor(() =>
        expect(fn.mock.calls.some((c) => String(c[0]) === '/api/settings/people/1/role' && (c[1] as RequestInit | undefined)?.method === 'PUT')).toBe(true),
      );
    });
  });

  describe('Sincronización, Snapshots e Iniciativas', () => {
    it('ejecuciones en sección con tabla moderna y pills de resultado', async () => {
      stub();
      const { container } = await renderGeneral();
      goTab('Sincronización');
      await screen.findByText('timeout');
      const s = sectionByTitle(container, 'Ejecuciones');
      expect(s.querySelector('summary .count')!.textContent).toBe('3');
      expect(s.querySelector('table.ft-modern')).toBeTruthy();
      const pills = [...s.querySelectorAll('tbody .st-pill')].map((p) => [p.textContent, p.className]);
      expect(pills).toEqual([
        ['en curso…', 'st-pill st-accent'],
        ['OK', 'st-pill st-ok'],
        ['error', 'st-pill st-warn'],
      ]);
      expect(screen.getByRole('button', { name: 'Sincronizar ahora' })).toBeTruthy();
    });

    it('sin ejecuciones: estado vacío', async () => {
      stub({ '/api/sync/status': { runs: [], health: {} } });
      const { container } = await renderGeneral();
      goTab('Sincronización');
      await waitFor(() =>
        expect(sectionByTitle(container, 'Ejecuciones').querySelector('.empty-state')!.textContent).toBe('Aún no hay ejecuciones de sincronización.'),
      );
    });

    it('snapshots en sección con tabla moderna; vacío con mensaje', async () => {
      stub();
      const { container } = await renderGeneral();
      goTab('Snapshots');
      await screen.findByRole('button', { name: 'Ver' });
      const s = sectionByTitle(container, 'Snapshots');
      expect(s.querySelector('summary .count')!.textContent).toBe('1');
      expect(s.querySelector('table.ft-modern')).toBeTruthy();
      cleanup();
      localStorage.clear();
      stub({ '/api/snapshots': { snapshots: [] } });
      const r = await renderGeneral();
      goTab('Snapshots');
      await waitFor(() => expect(sectionByTitle(r.container, 'Snapshots').querySelector('.empty-state')!.textContent).toBe('No hay snapshots guardados.'));
    });

    it('iniciativas en sección con contador; vacío con mensaje', async () => {
      stub();
      const { container } = await renderGeneral();
      goTab('Iniciativas');
      await screen.findByText('(pagos)');
      expect(sectionByTitle(container, 'Iniciativas').querySelector('summary .count')!.textContent).toBe('1');
      cleanup();
      localStorage.clear();
      stub({ '/api/settings/initiatives': { initiatives: [] } });
      const r = await renderGeneral();
      goTab('Iniciativas');
      await waitFor(() => expect(sectionByTitle(r.container, 'Iniciativas').querySelector('.empty-state')!.textContent).toBe('No hay iniciativas.'));
    });
  });
});
