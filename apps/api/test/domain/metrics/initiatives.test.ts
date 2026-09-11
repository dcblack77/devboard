import { describe, it, expect } from 'vitest';
import { analyzeIssues } from '../../../src/domain/metrics/issues.js';
import { initiativeStats, ragInitiative } from '../../../src/domain/metrics/initiatives.js';
import { baseSettings } from '../../fixtures/jiraSettings.js';
import { makeIssue } from '../../fixtures/jiraIssues.js';
import { weekLabels } from '../../../src/domain/metrics/time.js';
import type { EpicWithChildren } from '../../../src/integrations/jira/types.js';

const NOW = new Date('2026-02-01T00:00:00Z');
const WEEKS = weekLabels(NOW);

function epic(key: string, children: EpicWithChildren['children']): EpicWithChildren {
  return { key, summary: `Épica ${key}`, status: 'En curso', assigneeRaw: null, createdAt: new Date('2025-01-01T00:00:00Z'), children };
}

describe('initiativeStats', () => {
  it('pctDone sobre todos los hijos no-subtarea de las épicas de la iniciativa', () => {
    const epicIndex = {
      'PROJ-100': epic('PROJ-100', [
        { key: 'PROJ-1', summary: 'H1', type: 'Historia', status: 'Finalizada', assigneeRaw: 'Ana Pérez' },
        { key: 'PROJ-2', summary: 'H2', type: 'Historia', status: 'Por hacer', assigneeRaw: 'Ana Pérez' },
      ]),
    };
    const issues = [makeIssue({ key: 'PROJ-1', parentKey: 'PROJ-100', status: 'Finalizada', statusNorm: 'Finalizada' })];
    const rows = analyzeIssues(issues, [], baseSettings(), NOW);
    const [stat] = initiativeStats([{ name: 'Iniciativa X', epics: ['PROJ-100'] }], epicIndex, rows, WEEKS, NOW, baseSettings());

    expect(stat.childrenTotal).toBe(2);
    expect(stat.pctDone).toBe(50);
  });

  it('incluye issues cuyo padre es una historia (nieta de la épica)', () => {
    const epicIndex = {
      'PROJ-100': epic('PROJ-100', [{ key: 'PROJ-1', summary: 'H1', type: 'Historia', status: 'En curso', assigneeRaw: 'Ana Pérez' }]),
    };
    const issues = [
      makeIssue({ key: 'PROJ-1', parentKey: undefined, type: 'Historia', status: 'En curso', statusNorm: 'En curso' }),
      makeIssue({ key: 'PROJ-2', parentKey: 'PROJ-1', type: 'Subtarea', status: 'En curso', statusNorm: 'En curso' }),
    ];
    const rows = analyzeIssues(issues, [], baseSettings(), NOW);
    const [stat] = initiativeStats([{ name: 'Iniciativa Y', epics: ['PROJ-100'] }], epicIndex, rows, WEEKS, NOW, baseSettings());

    expect(stat.issues.map((i) => i.key)).toContain('PROJ-2');
  });
});

describe('ragInitiative', () => {
  const base = {
    name: 'X', slug: 'x', epics: [], childrenTotal: 10, pctDone: 0, inPeriod: 0, open: 0, done: 0,
    blockedNow: 0, throughput4w: 0, cycleMean: null, cycleMax: null, byStatusType: {}, daysByStateType: {},
    weekly: [], people: [], attention: [], issues: [],
  };

  it('verde si no queda trabajo abierto', () => {
    const stat = { ...base, childrenByMacro: { cerrada: 10 }, childrenTotal: 10, pctDone: 100 } as any;
    expect(ragInitiative(stat)).toEqual({ color: 'g', reason: 'Completada' });
  });

  it('rojo si hay 2+ bloqueadas', () => {
    const stat = { ...base, childrenByMacro: { bloqueada: 2, pendiente: 8 }, pctDone: 0 } as any;
    expect(ragInitiative(stat).color).toBe('r');
  });

  it('rojo si en marcha pero sin entregas en 4 semanas', () => {
    const stat = { ...base, childrenByMacro: { 'en_marcha': 3, pendiente: 7 }, throughput4w: 0, pctDone: 0 } as any;
    expect(ragInitiative(stat).color).toBe('r');
  });

  it('ámbar si el avance es menor al 50%', () => {
    const stat = { ...base, childrenByMacro: { cerrada: 3, pendiente: 7 }, pctDone: 30, throughput4w: 1 } as any;
    expect(ragInitiative(stat).color).toBe('a');
  });

  it('ámbar sin actividad (pendiente, sin marcha ni entregas)', () => {
    const stat = { ...base, childrenByMacro: { cerrada: 6, pendiente: 4 }, pctDone: 60, throughput4w: 0 } as any;
    expect(ragInitiative(stat).color).toBe('a');
  });

  it('verde si avanza (activo, con entregas recientes)', () => {
    const stat = { ...base, childrenByMacro: { cerrada: 6, 'en_marcha': 4 }, pctDone: 60, throughput4w: 2 } as any;
    expect(ragInitiative(stat).color).toBe('g');
  });
});
