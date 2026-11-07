import { describe, it, expect } from 'vitest';
import { analyzeIssues } from '../../../src/domain/metrics/issues.js';
import { devStats } from '../../../src/domain/metrics/people.js';
import { personMetrics, personSummary, rankTable, teamMedians } from '../../../src/domain/metrics/team.js';
import { baseSettings } from '../../fixtures/jiraSettings.js';
import { makeIssue } from '../../fixtures/jiraIssues.js';
import { weekLabels } from '../../../src/domain/metrics/time.js';
import { DEFAULT_THRESHOLDS } from '@teampulse/shared';
import type { ReviewStats } from '../../../src/domain/metrics/github.js';

const NOW = new Date('2026-02-01T00:00:00Z');
const WEEKS = weekLabels(NOW);

function ghWith(personName: string, stats: Partial<ReviewStats['people'][string]>): ReviewStats {
  return {
    total: 0, merged: 0, open: 0, merged4w: 0, hFirstReviewMean: null, hToMergeMean: null, hToMergeMax: null,
    pctMergedNoApproval: 0, mergedNoApproval: 0, hotfix: 0, hotfix4w: 0, weekly: [], repos: [], waiting: [], stale: [],
    people: {
      [personName]: {
        prs: 0, merged: 0, merged4w: 0, open: 0, open7d: 0, hFirstReviewMean: null, hToMergeMean: null,
        hToMergeMax: null, sizeMean: null, reviews: 0, prsReviewed: 0, approvals: 0, changesRequested: 0,
        authorsReviewed: 0, hResponseMean: null, selfMergedNoApproval: 0, hotfix: 0, balance: null,
        ...stats,
      },
    },
  };
}

describe('personMetrics', () => {
  it('combina Jira (DevStat) y GitHub (PersonReviewStats), calcula ratio y mezcla de tipos', () => {
    const issues = [
      makeIssue({ key: 'PROJ-1', assigneeRaw: 'Ana Pérez', type: 'Historia', status: 'Finalizada', statusNorm: 'Finalizada' }),
      makeIssue({ key: 'PROJ-2', assigneeRaw: 'Ana Pérez', type: 'Error', status: 'Finalizada', statusNorm: 'Finalizada' }),
    ];
    const settings = baseSettings();
    const rows = analyzeIssues(issues, [], settings, NOW);
    const dstats = devStats(rows, {}, settings, NOW, WEEKS);
    const ana = dstats.find((d) => d.dev === 'Ana Pérez')!;

    const gh = ghWith('Ana Pérez', { merged: 4, reviews: 2 });
    const m = personMetrics(ana, { gh });

    expect(m.name).toBe('Ana Pérez');
    expect(m.prsMerged).toBe(4);
    expect(m.reviews).toBe(2);
    expect(m.ratio).toBe(0.5);
    expect(Object.values(m.mix).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('sin datos de GitHub, ratio y campos derivados quedan en null/0', () => {
    const settings = baseSettings();
    const issues = [makeIssue({ key: 'PROJ-1', assigneeRaw: 'Luis Gómez', status: 'Por hacer', statusNorm: 'Por hacer' })];
    const rows = analyzeIssues(issues, [], settings, NOW);
    const dstats = devStats(rows, {}, settings, NOW, WEEKS);
    const luis = dstats.find((d) => d.dev === 'Luis Gómez')!;

    const m = personMetrics(luis, { gh: null });
    expect(m.prsMerged).toBe(0);
    expect(m.ratio).toBeNull();
  });
});

describe('teamMedians', () => {
  it('calcula la mediana de cada métrica ignorando nulls', () => {
    const ms = [
      personMetrics(
        devStats(analyzeIssues([makeIssue({ key: 'A-1', assigneeRaw: 'Ana', status: 'Finalizada', statusNorm: 'Finalizada' })], [], baseSettings(), NOW), {}, baseSettings(), NOW, WEEKS)[0]!,
        { gh: ghWith('Ana', { merged: 2, reviews: 4 }) },
      ),
      personMetrics(
        devStats(analyzeIssues([makeIssue({ key: 'B-1', assigneeRaw: 'Luis', status: 'Finalizada', statusNorm: 'Finalizada' })], [], baseSettings(), NOW), {}, baseSettings(), NOW, WEEKS)[0]!,
        { gh: ghWith('Luis', { merged: 4, reviews: 2 }) },
      ),
    ];
    const meds = teamMedians(ms);
    expect(meds.reviews).toBe(3);
    expect(meds.delivered).toBe(1);
  });
});

describe('rankTable', () => {
  it('ordena por reviews hechas y aplica semáforo de balance con los thresholds', () => {
    const settings = baseSettings();
    const anaRows = devStats(analyzeIssues([makeIssue({ key: 'A-1', assigneeRaw: 'Ana', status: 'Finalizada', statusNorm: 'Finalizada' })], [], settings, NOW), {}, settings, NOW, WEEKS);
    const luisRows = devStats(analyzeIssues([makeIssue({ key: 'B-1', assigneeRaw: 'Luis', status: 'Finalizada', statusNorm: 'Finalizada' })], [], settings, NOW), {}, settings, NOW, WEEKS);

    const ana = personMetrics(anaRows[0]!, { gh: ghWith('Ana', { merged: 4, reviews: 1 }) }); // ratio 0.25 -> rojo
    const luis = personMetrics(luisRows[0]!, { gh: ghWith('Luis', { merged: 2, reviews: 4 }) }); // ratio 2 -> verde, más reviews

    const meds = teamMedians([ana, luis]);
    const table = rankTable([ana, luis], meds, DEFAULT_THRESHOLDS);

    expect(table.rows[0]?.name).toBe('Luis'); // más reviews va primero
    expect(table.rows.find((r) => r.name === 'Ana')?.ratioColor).toBe('r');
    expect(table.rows.find((r) => r.name === 'Luis')?.ratioColor).toBe('g');
  });
});

describe('personSummary', () => {
  it('genera KPIs y perfil, comparando con la mediana cuando se pasa', () => {
    const settings = baseSettings();
    const anaRows = devStats(analyzeIssues([makeIssue({ key: 'A-1', assigneeRaw: 'Ana', status: 'Finalizada', statusNorm: 'Finalizada' })], [], settings, NOW), {}, settings, NOW, WEEKS);
    const ana = personMetrics(anaRows[0]!, { gh: ghWith('Ana', { merged: 2, reviews: 6, selfMergedNoApproval: 1 }) });
    const meds = teamMedians([ana]);

    const summary = personSummary(ana, meds);
    expect(summary.kpis.find((k) => k.label === 'Sin aprobación')?.color).toBe('r');
    expect(summary.profile).toHaveLength(3);

    const summaryNoMeds = personSummary(ana, null);
    expect(summaryNoMeds.profile[0]?.comparedToMedian).toBe('');
  });
});
