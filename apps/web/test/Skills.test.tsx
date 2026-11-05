// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Skills } from '../src/pages/Skills';

const SKILLS = {
  skills: [
    { id: 1, name: 'Testing', category: 'competency', description: null, sortOrder: 1, active: true },
    { id: 2, name: 'TypeScript', category: 'stack', description: null, sortOrder: 1, active: true },
    { id: 3, name: 'Pagos', category: 'domain', description: null, sortOrder: 1, active: true },
  ],
  people: [
    { id: 10, name: 'Ana', seniority: 'senior', role: 'Referente de testing' },
    { id: 11, name: 'Bruno', seniority: null, role: null },
  ],
  profiles: [
    { personId: 10, shape: 'specialist', contribution: 'guardian', role: 'Referente de testing', roleSource: 'manual', summary: 'Ana es especialista y guardiana del código.' },
    { personId: 11, shape: 'learning', contribution: 'occasional', role: 'Perfil en formación', roleSource: 'suggested', summary: 'Bruno está en formación con contribución puntual.' },
  ],
  matrix: [
    { personId: 10, skillId: 1, level: 3, source: 'manual', evidence: 'Lidera la estrategia de tests' },
    { personId: 11, skillId: 1, level: 2, source: 'manual', evidence: null },
    { personId: 10, skillId: 2, level: 2, source: 'manual', evidence: null },
    { personId: 11, skillId: 2, level: 1, source: 'auto', evidence: null },
    { personId: 10, skillId: 3, level: 0, source: 'auto', evidence: null },
  ],
  coverage: [
    { skillId: 1, count2plus: 2, count3: 1, busFactor: 2, risk: 'green' },
    { skillId: 2, count2plus: 1, count3: 0, busFactor: 1, risk: 'amber' },
    { skillId: 3, count2plus: 0, count3: 0, busFactor: 0, risk: 'red' },
  ],
};

function mockFetch() {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.endsWith('/api/skills') ? SKILLS : url.endsWith('/api/auth/me') ? { role: 'viewer' } : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

describe('Skills — matriz y bus factor', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('pinta personas, skills, cobertura y riesgo', async () => {
    mockFetch();
    render(<Skills />);

    await screen.findByText('Competencias');
    expect(screen.getAllByText('Ana').length).toBe(4);
    expect(screen.getAllByText('Bruno').length).toBe(4);
    expect(screen.getByText('Testing')).toBeTruthy();
    // TypeScript sale en la cabecera de la matriz y en la lista de riesgo.
    expect(screen.getAllByText('TypeScript').length).toBe(2);

    expect(screen.getByTestId('coverage-1').textContent).toBe('2');
    expect(screen.getByTestId('coverage-1').className).toContain('risk-green');
    expect(screen.getByTestId('coverage-2').textContent).toBe('1');
    expect(screen.getByTestId('coverage-2').className).toContain('risk-amber');
    expect(screen.getByTestId('coverage-3').textContent).toBe('0');
    expect(screen.getByTestId('coverage-3').className).toContain('risk-red');

    const list = screen.getByText('Riesgo bus factor').parentElement!;
    const items = list.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].className).toContain('risk-red');
    expect(items[0].textContent).toContain('Pagos');
    expect(items[1].textContent).toContain('TypeScript');

    // Sección "Perfiles": resumen y etiquetas en español por persona.
    expect(screen.getByText('Perfiles')).toBeTruthy();
    expect(screen.getByText('Ana es especialista y guardiana del código.')).toBeTruthy();
    expect(screen.getByText('Bruno está en formación con contribución puntual.')).toBeTruthy();
    expect(screen.getByText('Especialista')).toBeTruthy();
    expect(screen.getByText('Guardián')).toBeTruthy();
    expect(screen.getByText('En formación')).toBeTruthy();
    expect(screen.getByText('Puntual')).toBeTruthy();
    expect(screen.getByText('sugerido')).toBeTruthy();
    expect(screen.getByTestId('profile-10').textContent).toContain('Referente de testing');

    // Como viewer no hay botones de edición.
    expect(screen.queryByText('Recalcular dominio')).toBeNull();
  });
});
