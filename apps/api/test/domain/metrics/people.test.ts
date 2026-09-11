import { describe, it, expect } from 'vitest';
import { analyzeIssues } from '../../../src/domain/metrics/issues.js';
import { devStats } from '../../../src/domain/metrics/people.js';
import { baseSettings } from '../../fixtures/jiraSettings.js';
import { makeIssue, makeSegment } from '../../fixtures/jiraIssues.js';
import { weekLabels } from '../../../src/domain/metrics/time.js';
import type { EpicWithChildren } from '../../../src/integrations/jira/types.js';

const NOW = new Date('2026-02-01T00:00:00Z');
const WEEKS = weekLabels(NOW);

describe('devStats', () => {
  it('agrupa por assignee y calcula throughput 4 semanas', () => {
    const issues = [
      makeIssue({ key: 'PROJ-1', assigneeRaw: 'Ana Pérez', type: 'Historia', status: 'Finalizada', statusNorm: 'Finalizada' }),
      makeIssue({ key: 'PROJ-2', assigneeRaw: 'Ana Pérez', type: 'Tarea', status: 'Por hacer', statusNorm: 'Por hacer' }),
      makeIssue({ key: 'PROJ-3', assigneeRaw: 'Luis Gómez', type: 'Historia', status: 'En curso', statusNorm: 'En curso' }),
    ];
    const segments = [
      makeSegment({ issueKey: 'PROJ-1', status: 'En curso', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-01-10T00:00:00Z'), seq: 0 }),
      makeSegment({ issueKey: 'PROJ-1', status: 'Entregada', startedAt: new Date('2026-01-10T00:00:00Z'), endedAt: new Date('2026-01-20T00:00:00Z'), seq: 1 }),
      makeSegment({ issueKey: 'PROJ-1', status: 'Finalizada', startedAt: new Date('2026-01-20T00:00:00Z'), endedAt: null, seq: 2 }),
    ];
    const rows = analyzeIssues(issues, segments, baseSettings(), NOW);
    const stats = devStats(rows, {}, baseSettings(), NOW, WEEKS);

    const ana = stats.find((d) => d.dev === 'Ana Pérez');
    expect(ana?.total).toBe(2);
    expect(ana?.done).toBe(1);
    expect(ana?.open).toBe(1);
    expect(ana?.throughput4w).toBe(1); // entregada el 20-ene, dentro de 4 semanas antes de NOW (1-feb)

    const luis = stats.find((d) => d.dev === 'Luis Gómez');
    expect(luis?.active).toBe(1); // "En curso" es macro en_marcha
  });

  it('issues sin asignar van a "(sin asignar)" y quedan al final', () => {
    const issues = [
      makeIssue({ key: 'PROJ-1', assigneeRaw: null, status: 'Por hacer', statusNorm: 'Por hacer' }),
      makeIssue({ key: 'PROJ-2', assigneeRaw: 'Ana Pérez', status: 'Por hacer', statusNorm: 'Por hacer' }),
    ];
    const rows = analyzeIssues(issues, [], baseSettings(), NOW);
    const stats = devStats(rows, {}, baseSettings(), NOW, WEEKS);

    expect(stats.at(-1)?.dev).toBe('(sin asignar)');
  });

  it('pctDone de épicas usa TODOS los hijos, sin filtrar por ventana', () => {
    const epicIndex: Record<string, EpicWithChildren> = {
      'PROJ-100': {
        key: 'PROJ-100',
        summary: 'Épica de prueba',
        status: 'En curso',
        assigneeRaw: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        children: [
          { key: 'PROJ-1', summary: 'Hija 1', type: 'Historia', status: 'Finalizada', assigneeRaw: 'Ana Pérez' },
          { key: 'PROJ-2', summary: 'Hija 2', type: 'Historia', status: 'Por hacer', assigneeRaw: 'Ana Pérez' },
          { key: 'PROJ-3', summary: 'Hija 3', type: 'Historia', status: 'Por hacer', assigneeRaw: 'Otro Dev' },
        ],
      },
    };
    const issues = [makeIssue({ key: 'PROJ-1', assigneeRaw: 'Ana Pérez', status: 'Finalizada', statusNorm: 'Finalizada' })];
    const rows = analyzeIssues(issues, [], baseSettings(), NOW);
    const stats = devStats(rows, epicIndex, baseSettings(), NOW, WEEKS);

    const ana = stats.find((d) => d.dev === 'Ana Pérez');
    expect(ana?.epics).toHaveLength(1);
    // 1 de 3 hijos entregado/cerrado -> 33%
    expect(ana?.epics[0].pctDone).toBe(33);
    expect(ana?.epics[0].childrenTotal).toBe(3);
  });

  it('genera "attention" solo para issues abiertas con razones', () => {
    const issues = [makeIssue({ key: 'PROJ-1', assigneeRaw: 'Ana Pérez', status: 'Bloqueada', statusNorm: 'Bloqueada' })];
    const segments = [
      makeSegment({ issueKey: 'PROJ-1', status: 'Bloqueada', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: null, seq: 0 }),
    ];
    const rows = analyzeIssues(issues, segments, baseSettings(), NOW);
    const stats = devStats(rows, {}, baseSettings(), NOW, WEEKS);
    const ana = stats.find((d) => d.dev === 'Ana Pérez');

    expect(ana?.attention).toHaveLength(1);
    expect(ana?.attention[0].why.length).toBeGreaterThan(0);
  });
});
