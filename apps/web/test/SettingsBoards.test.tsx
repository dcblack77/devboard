// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from '../src/pages/Settings';
import { Nav } from '../src/components/Nav';

const SETTINGS = {
  id: 1,
  jiraBoards: [{ key: 'MAIN', kind: 'dev', name: null }],
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

function stubSettings() {
  const fn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.method === 'PUT' ? { settings: { ...SETTINGS, ...JSON.parse(String(init.body)) } } : { settings: SETTINGS };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

describe('Settings · Tableros de Jira', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the boards list, help text, escalated status and SLA editor', async () => {
    stubSettings();
    render(<Settings />);
    expect(await screen.findByRole('heading', { name: 'Tableros de Jira' })).toBeTruthy();
    expect((screen.getByLabelText('Clave 1') as HTMLInputElement).value).toBe('MAIN');
    expect((screen.getByLabelText('Tipo 1') as HTMLSelectElement).value).toBe('dev');
    expect((screen.getByLabelText('Nombre 1') as HTMLInputElement).value).toBe('');
    expect(
      screen.getByText('Puedes tener varios tableros de desarrollo y de soporte. Las métricas se pueden ver juntas (Todos) o por tablero.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Estado escalado al equipo')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'SLA de soporte' })).toBeTruthy();
    expect((screen.getByLabelText('Prioridad 1') as HTMLInputElement).value).toBe('Alta');
    expect(screen.queryByLabelText('Principal')).toBeNull();
    expect(screen.queryByLabelText('Soporte')).toBeNull();
  });

  it('adds boards and sends jiraBoards (normalized), support fields and SLA in the PUT body', async () => {
    const fn = stubSettings();
    render(<Settings />);
    await screen.findByRole('heading', { name: 'Tableros de Jira' });
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir tablero' }));
    fireEvent.change(screen.getByLabelText('Clave 2'), { target: { value: ' sup ' } });
    fireEvent.change(screen.getByLabelText('Tipo 2'), { target: { value: 'support' } });
    fireEvent.change(screen.getByLabelText('Nombre 2'), { target: { value: 'Soporte clientes' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir tablero' }));
    fireEvent.change(screen.getByLabelText('Clave 3'), { target: { value: 'OPS' } });
    fireEvent.change(screen.getByLabelText('Estado escalado al equipo'), { target: { value: 'En equipo técnico' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir prioridad' }));
    fireEvent.change(screen.getByLabelText('Prioridad 2'), { target: { value: 'Baja' } });
    fireEvent.change(screen.getByLabelText('Resolución (h) 2'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(fn.mock.calls.some((c) => (c as unknown[])[1] && ((c as unknown[])[1] as RequestInit).method === 'PUT')).toBe(true));
    const put = fn.mock.calls.find((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method === 'PUT') as unknown[];
    const body = JSON.parse(String((put[1] as RequestInit).body));
    expect(body.jiraBoards).toEqual([
      { key: 'MAIN', kind: 'dev', name: null },
      { key: 'SUP', kind: 'support', name: 'Soporte clientes' },
      { key: 'OPS', kind: 'dev', name: null },
    ]);
    expect(body).not.toHaveProperty('jiraProject');
    expect(body).not.toHaveProperty('supportProject');
    expect(body.supportTechStatus).toBe('En equipo técnico');
    expect(body.supportSla).toEqual({
      Alta: { firstResponseHours: 4, resolutionHours: 48 },
      Baja: { resolutionHours: 120 },
    });
  });

  it('removes a board and sends the remaining list', async () => {
    const fn = stubSettings();
    render(<Settings />);
    await screen.findByRole('heading', { name: 'Tableros de Jira' });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar tablero 1' }));
    expect(screen.queryByLabelText('Clave 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(fn.mock.calls.some((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method === 'PUT')).toBe(true));
    const put = fn.mock.calls.find((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method === 'PUT') as unknown[];
    expect(JSON.parse(String((put[1] as RequestInit).body)).jiraBoards).toEqual([]);
  });

  it('warns about duplicate keys and does not save', async () => {
    const fn = stubSettings();
    render(<Settings />);
    await screen.findByRole('heading', { name: 'Tableros de Jira' });
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir tablero' }));
    fireEvent.change(screen.getByLabelText('Clave 2'), { target: { value: 'main' } });
    expect(screen.getByText('Clave repetida: MAIN')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText(/Tableros de Jira: hay claves repetidas/);
    expect(fn.mock.calls.some((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method === 'PUT')).toBe(false);
  });

  it('removes an SLA row', async () => {
    const fn = stubSettings();
    render(<Settings />);
    await screen.findByRole('heading', { name: 'Tableros de Jira' });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar prioridad 1' }));
    expect(screen.queryByLabelText('Prioridad 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(fn.mock.calls.some((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method === 'PUT')).toBe(true));
    const put = fn.mock.calls.find((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method === 'PUT') as unknown[];
    expect(JSON.parse(String((put[1] as RequestInit).body)).supportSla).toEqual({});
  });
});

describe('Nav', () => {
  afterEach(() => cleanup());

  it('shows Incidencias right after Sistema', () => {
    render(
      <MemoryRouter>
        <Nav role={null} />
      </MemoryRouter>,
    );
    const labels = screen.getAllByRole('link').map((a) => a.textContent);
    expect(labels[labels.indexOf('Sistema') + 1]).toBe('Incidencias');
  });
});
