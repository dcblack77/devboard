// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from '../src/pages/Settings';
import { Nav } from '../src/components/Nav';

const SETTINGS = {
  id: 1,
  jiraProject: 'MAIN',
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
  supportProject: null,
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

  it('shows the boards card with main, support, escalated status and SLA editor', async () => {
    stubSettings();
    render(<Settings />);
    expect(await screen.findByRole('heading', { name: 'Tableros de Jira' })).toBeTruthy();
    expect((screen.getByLabelText('Principal') as HTMLInputElement).value).toBe('MAIN');
    expect((screen.getByLabelText('Soporte') as HTMLInputElement).placeholder).toBe('SUP');
    expect(screen.getByLabelText('Estado escalado al equipo')).toBeTruthy();
    expect(screen.getByText('Sin tablero de soporte, la sección Incidencias queda desactivada.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'SLA de soporte' })).toBeTruthy();
    expect((screen.getByLabelText('Prioridad 1') as HTMLInputElement).value).toBe('Alta');
    // jiraProject no se duplica en otra tarjeta
    expect(screen.queryByLabelText('Proyecto Jira')).toBeNull();
  });

  it('sends support fields and SLA (omitting empty hours) in the PUT body', async () => {
    const fn = stubSettings();
    render(<Settings />);
    await screen.findByRole('heading', { name: 'Tableros de Jira' });
    fireEvent.change(screen.getByLabelText('Soporte'), { target: { value: 'SUP' } });
    fireEvent.change(screen.getByLabelText('Estado escalado al equipo'), { target: { value: 'En equipo técnico' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir prioridad' }));
    fireEvent.change(screen.getByLabelText('Prioridad 2'), { target: { value: 'Baja' } });
    fireEvent.change(screen.getByLabelText('Resolución (h) 2'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(fn.mock.calls.some((c) => (c as unknown[])[1] && ((c as unknown[])[1] as RequestInit).method === 'PUT')).toBe(true));
    const put = fn.mock.calls.find((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method === 'PUT') as unknown[];
    const body = JSON.parse(String((put[1] as RequestInit).body));
    expect(body.jiraProject).toBe('MAIN');
    expect(body.supportProject).toBe('SUP');
    expect(body.supportTechStatus).toBe('En equipo técnico');
    expect(body.supportSla).toEqual({
      Alta: { firstResponseHours: 4, resolutionHours: 48 },
      Baja: { resolutionHours: 120 },
    });
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
