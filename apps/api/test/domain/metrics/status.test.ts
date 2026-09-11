import { describe, it, expect } from 'vitest';
import { analyzeIssues } from '../../../src/domain/metrics/issues.js';
import { statusStats, daysByStateType } from '../../../src/domain/metrics/status.js';
import { baseSettings, STATUS_FLOW } from '../../fixtures/jiraSettings.js';
import { makeIssue, makeSegment } from '../../fixtures/jiraIssues.js';

const NOW = new Date('2026-02-01T00:00:00Z');

describe('statusStats', () => {
  it('agrega n/mean/max por estado y excluye épicas', () => {
    const issues = [
      makeIssue({ key: 'PROJ-1', type: 'Historia', status: 'En curso', statusNorm: 'En curso' }),
      makeIssue({ key: 'PROJ-2', type: 'Epic', status: 'En curso', statusNorm: 'En curso' }),
    ];
    const segments = [
      makeSegment({ issueKey: 'PROJ-1', status: 'En curso', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: null, seq: 0 }),
      makeSegment({ issueKey: 'PROJ-2', status: 'En curso', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: null, seq: 0 }),
    ];
    const rows = analyzeIssues(issues, segments, baseSettings(), NOW);
    const stats = statusStats(rows, NOW, STATUS_FLOW);

    const enCurso = stats.find((s) => s.status === 'En curso');
    expect(enCurso?.n).toBe(1); // solo PROJ-1, no la épica
    expect(enCurso?.openN).toBe(1);
  });

  it('respeta el orden de statusFlow', () => {
    const issues = [
      makeIssue({ key: 'PROJ-1', status: 'Finalizada', statusNorm: 'Finalizada' }),
      makeIssue({ key: 'PROJ-2', status: 'Backlog', statusNorm: 'Backlog' }),
    ];
    // PROJ-1 pasó por 'En curso' antes de Finalizada: el tramo abierto en Finalizada no suma tiempo.
    const segments = [
      makeSegment({ issueKey: 'PROJ-1', status: 'En curso', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-01-05T00:00:00Z'), seq: 0 }),
      makeSegment({ issueKey: 'PROJ-1', status: 'Finalizada', startedAt: new Date('2026-01-05T00:00:00Z'), endedAt: null, seq: 1 }),
    ];
    const rows = analyzeIssues(issues, segments, baseSettings(), NOW);
    const stats = statusStats(rows, NOW, STATUS_FLOW);
    const order = stats.map((s) => s.status);
    expect(order.indexOf('Backlog')).toBeLessThan(order.indexOf('En curso'));
    expect(order).not.toContain('Finalizada'); // sin tiempo acumulado, no aparece
  });
});

describe('daysByStateType', () => {
  it('agrupa tiempo acumulado por tipo y estado', () => {
    const issues = [makeIssue({ key: 'PROJ-1', type: 'Tarea', status: 'En curso', statusNorm: 'En curso' })];
    const segments = [
      makeSegment({ issueKey: 'PROJ-1', status: 'En curso', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-01-02T00:00:00Z'), seq: 0 }),
    ];
    const rows = analyzeIssues(issues, segments, baseSettings(), NOW);
    const out = daysByStateType(rows);

    expect(out['Tarea']['En curso']).toEqual({ media: 24, max: 24, n: 1 });
  });
});
