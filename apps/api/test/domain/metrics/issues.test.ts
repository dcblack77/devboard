import { describe, it, expect } from 'vitest';
import { analyzeIssues } from '../../../src/domain/metrics/issues.js';
import { baseSettings } from '../../fixtures/jiraSettings.js';
import { makeIssue, makeSegment } from '../../fixtures/jiraIssues.js';

const NOW = new Date('2026-02-01T00:00:00Z');

describe('analyzeIssues', () => {
  it('calcula cycleHours y leadHours desde el primer "En curso" al primer entregado', () => {
    const issue = makeIssue({
      key: 'PROJ-1',
      type: 'Historia',
      status: 'Finalizada',
      statusNorm: 'Finalizada',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const segments = [
      makeSegment({ issueKey: 'PROJ-1', status: 'Por hacer', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-01-02T00:00:00Z'), seq: 0 }),
      makeSegment({ issueKey: 'PROJ-1', status: 'En curso', startedAt: new Date('2026-01-02T00:00:00Z'), endedAt: new Date('2026-01-04T00:00:00Z'), seq: 1 }),
      makeSegment({ issueKey: 'PROJ-1', status: 'Entregada', startedAt: new Date('2026-01-04T00:00:00Z'), endedAt: new Date('2026-01-05T00:00:00Z'), seq: 2 }),
      makeSegment({ issueKey: 'PROJ-1', status: 'Finalizada', startedAt: new Date('2026-01-05T00:00:00Z'), endedAt: null, seq: 3 }),
    ];
    const [row] = analyzeIssues([issue], segments, baseSettings(), NOW);

    expect(row.cycleHours).toBe(48); // 2 días de "En curso" a "Entregada"
    expect(row.leadHours).toBe(72); // 3 días de created a "Entregada"
    expect(row.done).toBe(true);
    expect(row.inStatusHours).toBe(0); // cerrada: sin tiempo abierto
  });

  it('issue sin segmentos previos: un tramo abierto desde created hasta now', () => {
    const issue = makeIssue({
      key: 'PROJ-2',
      status: 'Por hacer',
      statusNorm: 'Por hacer',
      createdAt: new Date('2026-01-30T00:00:00Z'),
    });
    const [row] = analyzeIssues([issue], [], baseSettings(), NOW);

    expect(row.segments).toHaveLength(1);
    expect(row.inStatusHours).toBe(48); // 2 días desde created hasta NOW
    expect(row.cycleHours).toBeNull();
  });

  it('cuenta visitas repetidas al mismo estado', () => {
    const issue = makeIssue({ key: 'PROJ-3', status: 'En curso', statusNorm: 'En curso' });
    const segments = [
      makeSegment({ issueKey: 'PROJ-3', status: 'En curso', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-01-02T00:00:00Z'), seq: 0 }),
      makeSegment({ issueKey: 'PROJ-3', status: 'En revisión', startedAt: new Date('2026-01-02T00:00:00Z'), endedAt: new Date('2026-01-03T00:00:00Z'), seq: 1 }),
      makeSegment({ issueKey: 'PROJ-3', status: 'En curso', startedAt: new Date('2026-01-03T00:00:00Z'), endedAt: null, seq: 2 }),
    ];
    const [row] = analyzeIssues([issue], segments, baseSettings(), NOW);

    expect(row.visits['En curso']).toBe(2);
    expect(row.visits['En revisión']).toBe(1);
  });

  it('genera atención por bloqueo', () => {
    const issue = makeIssue({ key: 'PROJ-4', status: 'Bloqueada', statusNorm: 'Bloqueada' });
    const segments = [
      makeSegment({ issueKey: 'PROJ-4', status: 'Bloqueada', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: null, seq: 0 }),
    ];
    const [row] = analyzeIssues([issue], segments, baseSettings(), NOW);

    expect(row.attention.some((a) => a.includes('bloqueada'))).toBe(true);
  });

  it('genera atención por estancamiento en revisión (> reviewDays)', () => {
    const issue = makeIssue({ key: 'PROJ-5', status: 'En revisión', statusNorm: 'En revisión' });
    const segments = [
      makeSegment({ issueKey: 'PROJ-5', status: 'En revisión', startedAt: new Date('2026-01-20T00:00:00Z'), endedAt: null, seq: 0 }),
    ];
    const [row] = analyzeIssues([issue], segments, baseSettings(), NOW);

    expect(row.attention.some((a) => a.includes('esperando revisión'))).toBe(true);
  });

  it('genera atención por múltiples visitas a revisión', () => {
    const issue = makeIssue({ key: 'PROJ-6', status: 'En curso', statusNorm: 'En curso' });
    const segments = [
      makeSegment({ issueKey: 'PROJ-6', status: 'En revisión', startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-01-02T00:00:00Z'), seq: 0 }),
      makeSegment({ issueKey: 'PROJ-6', status: 'En curso', startedAt: new Date('2026-01-02T00:00:00Z'), endedAt: new Date('2026-01-03T00:00:00Z'), seq: 1 }),
      makeSegment({ issueKey: 'PROJ-6', status: 'En revisión', startedAt: new Date('2026-01-03T00:00:00Z'), endedAt: new Date('2026-01-04T00:00:00Z'), seq: 2 }),
      makeSegment({ issueKey: 'PROJ-6', status: 'En curso', startedAt: new Date('2026-01-04T00:00:00Z'), endedAt: null, seq: 3 }),
    ];
    const [row] = analyzeIssues([issue], segments, baseSettings(), NOW);

    expect(row.attention.some((a) => a.includes('vuelto a revisión 2 veces'))).toBe(true);
  });

  it('las subtareas nunca cuentan como counted aunque el tipo esté en countedTypes', () => {
    const issue = makeIssue({ key: 'PROJ-7', type: 'Subtarea', status: 'Finalizada', statusNorm: 'Finalizada' });
    const settings = { ...baseSettings(), countedTypes: ['Subtarea', 'Historia', 'Tarea', 'Error'] };
    const [row] = analyzeIssues([issue], [], settings, NOW);

    expect(row.counted).toBe(false);
  });
});
