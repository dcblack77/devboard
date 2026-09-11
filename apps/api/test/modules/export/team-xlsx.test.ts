import { describe, it, expect } from 'vitest';
import { buildTeamWorkbook } from '../../../src/modules/export/team-xlsx.js';
import type { PersonMetrics, TeamMedians } from '../../../src/domain/metrics/team.js';
import type { HomeSummary } from '../../../src/domain/metrics/home.js';

const FAKE_HOME: HomeSummary = {
  numbers: {
    lastWeek: 3,
    avg4: 2.5,
    weekLabels: ['2026-W01'],
    weekTotals: [3],
    open: 4,
    blocked: 1,
    blocked5d: 0,
    aged: 1,
    attention: 2,
    delivered: 10,
    delivered4w: 5,
    bugs4w: 1,
    feat4w: 4,
    bugsTotal: 3,
    cycleMean: 48,
    cycleMax: 96,
    byStatus: {},
    initiatives: [],
    github: {
      open: 2,
      waiting: 1,
      firstReview: 12,
      toMerge: 30,
      merged4w: 6,
      noApproval: 1,
      pctNoApproval: 16,
      hotfix4w: 0,
      hotfix: 1,
      merged: 10,
    },
    people: 2,
  },
  trend: null,
  rag: [],
  ragCounts: { green: 1, amber: 0, red: 0 },
};

function fakePerson(overrides: Partial<PersonMetrics> = {}): PersonMetrics {
  return {
    name: 'Ana Pérez',
    slug: 'ana-perez',
    delivered: 5,
    delivered4w: 2,
    open: 1,
    blocked: 0,
    attention: 0,
    cycleMean: 48,
    cycleDays: 2,
    prs: 3,
    prsMerged: 3,
    prs4w: 1,
    reviews: 4,
    prsReviewed: 3,
    approvals: 3,
    changesRequested: 0,
    authorsReviewed: 2,
    ratio: 1.3,
    responseH: 5,
    firstReviewH: 10,
    toMergeH: 20,
    noApproval: 0,
    open7d: 0,
    hotfix: 0,
    sizeMean: 100,
    dominant: 'Historia',
    mix: { Historia: 80, Error: 20 },
    ...overrides,
  };
}

const FAKE_MEDIANS: TeamMedians = {
  delivered: 5,
  reviews: 4,
  ratio: 1,
  responseH: 5,
  firstReviewH: 10,
  cycleDays: 2,
  prsMerged: 3,
  authorsReviewed: 2,
};

describe('buildTeamWorkbook', () => {
  it('genera un workbook con las hojas esperadas y cabeceras en español', async () => {
    const wb = buildTeamWorkbook({
      home: FAKE_HOME,
      peopleMetrics: [fakePerson()],
      medians: FAKE_MEDIANS,
      initiativesList: [],
      issues: [],
      prs: [],
      periodo: '2026-01-01 → 2026-02-01',
    });

    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toEqual(['Resumen equipo', 'Ranking', 'Ana Pérez', 'Iniciativas', 'Issues']);

    const resumen = wb.getWorksheet('Resumen equipo')!;
    expect(resumen.getRow(1).getCell(1).value).toBe('Métrica');
    expect(resumen.getRow(2).getCell(1).value).toBe('Periodo');
    expect(resumen.getRow(2).getCell(2).value).toBe('2026-01-01 → 2026-02-01');

    const ranking = wb.getWorksheet('Ranking')!;
    expect(ranking.getRow(1).getCell(1).value).toBe('Persona');
    expect(ranking.getRow(2).getCell(1).value).toBe('Ana Pérez');
  });

  it('no crea la hoja PRs si no hay pull requests, y la crea si las hay', async () => {
    const wbSinPrs = buildTeamWorkbook({
      home: FAKE_HOME,
      peopleMetrics: [],
      medians: FAKE_MEDIANS,
      initiativesList: [],
      issues: [],
      prs: [],
      periodo: 'x',
    });
    expect(wbSinPrs.getWorksheet('PRs')).toBeUndefined();

    const wbConPrs = buildTeamWorkbook({
      home: FAKE_HOME,
      peopleMetrics: [],
      medians: FAKE_MEDIANS,
      initiativesList: [],
      issues: [],
      prs: [
        {
          repo: 'proj-api',
          number: 42,
          title: 'PROJ-1 feat',
          url: 'https://example.test/pr/42',
          author: 'Ana Pérez',
          state: 'mergeada',
          draft: false,
          created: new Date('2026-01-01T00:00:00Z'),
          ready: new Date('2026-01-01T00:00:00Z'),
          merged: new Date('2026-01-02T00:00:00Z'),
          closed: null,
          mergedBy: 'Ana Pérez',
          additions: 10,
          deletions: 5,
          files: 2,
          size: 15,
          reviews: [],
          reviewers: [],
          approvals: 1,
          copilotReviews: 0,
          changesRequested: 0,
          requested: [],
          hFirstReview: 4,
          hToMerge: 24,
          hOpen: null,
          selfMergedNoApproval: false,
          hotfix: false,
          issueKeys: ['PROJ-1'],
          week: '2026-W01',
        },
      ],
      periodo: 'x',
    });
    expect(wbConPrs.getWorksheet('PRs')).toBeDefined();
  });

  it('produce un buffer no vacío (verificable por tamaño en la respuesta HTTP real)', async () => {
    const wb = buildTeamWorkbook({
      home: FAKE_HOME,
      peopleMetrics: [fakePerson()],
      medians: FAKE_MEDIANS,
      initiativesList: [],
      issues: [],
      prs: [],
      periodo: 'x',
    });
    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});
