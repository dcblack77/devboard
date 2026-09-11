import { describe, it, expect } from 'vitest';
import { analyzeIssues } from '../../../src/domain/metrics/issues.js';
import { devStats } from '../../../src/domain/metrics/people.js';
import { initiativeStats } from '../../../src/domain/metrics/initiatives.js';
import { homeSummary, teamNumbers } from '../../../src/domain/metrics/home.js';
import { baseSettings } from '../../fixtures/jiraSettings.js';
import { makeIssue, makeSegment } from '../../fixtures/jiraIssues.js';
import { weekLabels } from '../../../src/domain/metrics/time.js';
import type { EpicWithChildren } from '../../../src/integrations/jira/types.js';

const NOW = new Date('2026-02-01T00:00:00Z');
const WEEKS = weekLabels(NOW);

describe('teamNumbers / homeSummary', () => {
  it('cuenta entregadas, abiertas, bloqueadas y errores vs funcionalidad', () => {
    const issues = [
      makeIssue({ key: 'PROJ-1', assigneeRaw: 'Ana Pérez', type: 'Historia', status: 'Finalizada', statusNorm: 'Finalizada' }),
      makeIssue({ key: 'PROJ-2', assigneeRaw: 'Ana Pérez', type: 'Error', status: 'Finalizada', statusNorm: 'Finalizada' }),
      makeIssue({ key: 'PROJ-3', assigneeRaw: 'Luis Gómez', type: 'Historia', status: 'Bloqueada', statusNorm: 'Bloqueada' }),
      makeIssue({ key: 'PROJ-4', assigneeRaw: 'Luis Gómez', type: 'Tarea', status: 'Por hacer', statusNorm: 'Por hacer' }),
    ];
    const segments = [
      makeSegment({ issueKey: 'PROJ-1', status: 'En curso', startedAt: new Date('2026-01-05T00:00:00Z'), endedAt: new Date('2026-01-15T00:00:00Z'), seq: 0 }),
      makeSegment({ issueKey: 'PROJ-1', status: 'Finalizada', startedAt: new Date('2026-01-15T00:00:00Z'), endedAt: null, seq: 1 }),
      makeSegment({ issueKey: 'PROJ-2', status: 'En curso', startedAt: new Date('2026-01-06T00:00:00Z'), endedAt: new Date('2026-01-18T00:00:00Z'), seq: 0 }),
      makeSegment({ issueKey: 'PROJ-2', status: 'Finalizada', startedAt: new Date('2026-01-18T00:00:00Z'), endedAt: null, seq: 1 }),
      makeSegment({ issueKey: 'PROJ-3', status: 'Bloqueada', startedAt: new Date('2026-01-10T00:00:00Z'), endedAt: null, seq: 0 }),
    ];
    const settings = baseSettings();
    const rows = analyzeIssues(issues, segments, settings, NOW);
    const dstats = devStats(rows, {}, settings, NOW, WEEKS);
    const initiativesList = initiativeStats([], {}, rows, WEEKS, NOW, settings);

    const T = teamNumbers(rows, dstats, { now: NOW, settings, initiativesList, gh: null });

    expect(T.delivered).toBe(2);
    expect(T.bugs4w).toBe(1);
    expect(T.feat4w).toBe(1);
    expect(T.blocked).toBe(1);
    expect(T.open).toBe(2); // PROJ-3 (bloqueada) + PROJ-4 (por hacer)
    expect(T.people).toBe(2);
  });

  it('el RAG resumido cuenta iniciativas verdes/ámbar/rojas', () => {
    const epicIndex: Record<string, EpicWithChildren> = {
      'PROJ-100': {
        key: 'PROJ-100',
        summary: 'Épica completada',
        status: 'Finalizada',
        assigneeRaw: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        children: [{ key: 'PROJ-1', summary: 'H1', type: 'Historia', status: 'Finalizada', assigneeRaw: 'Ana Pérez' }],
      },
    };
    const settings = baseSettings();
    const issues = [makeIssue({ key: 'PROJ-1', assigneeRaw: 'Ana Pérez', status: 'Finalizada', statusNorm: 'Finalizada' })];
    const rows = analyzeIssues(issues, [], settings, NOW);
    const dstats = devStats(rows, epicIndex, settings, NOW, WEEKS);
    const initiativesList = initiativeStats(
      [{ name: 'Iniciativa X', epics: ['PROJ-100'] }],
      epicIndex,
      rows,
      WEEKS,
      NOW,
      settings,
    );

    const home = homeSummary(rows, dstats, { now: NOW, settings, initiativesList, gh: null });

    expect(home.rag).toHaveLength(1);
    expect(home.rag[0]?.color).toBe('g');
    expect(home.ragCounts.green).toBe(1);
    expect(home.ragCounts.red).toBe(0);
  });

  it('trend es null sin historial de 4 semanas previas', () => {
    const settings = baseSettings();
    const rows = analyzeIssues([], [], settings, NOW);
    const dstats = devStats(rows, {}, settings, NOW, WEEKS);
    const initiativesList = initiativeStats([], {}, rows, WEEKS, NOW, settings);
    const home = homeSummary(rows, dstats, { now: NOW, settings, initiativesList, gh: null });
    expect(home.trend).toBeNull();
  });
});
