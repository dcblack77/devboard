/**
 * Contrato: `initiativeStats` y `homeSummary` exponen fechas, estado de plazo y estimación
 * por iniciativa (agregado de sus épicas) y por épica. Ver `src/domain/metrics/schedule.ts`.
 */
import { describe, it, expect } from 'vitest';
import { analyzeIssues } from '../../../src/domain/metrics/issues.js';
import { initiativeStats } from '../../../src/domain/metrics/initiatives.js';
import { homeSummary } from '../../../src/domain/metrics/home.js';
import { weekLabels } from '../../../src/domain/metrics/time.js';
import { baseSettings } from '../../fixtures/jiraSettings.js';
import type { EpicWithChildren } from '../../../src/integrations/jira/types.js';

const NOW = new Date('2026-03-12T10:00:00Z');
const WEEKS = weekLabels(NOW);
const BROWSE = 'https://example.atlassian.net/browse/';

type Child = EpicWithChildren['children'][number];

function child(key: string, status: string, over: Partial<Child> = {}): Child {
  return { key, summary: `Historia ${key}`, type: 'Historia', status, assigneeRaw: null, ...over } as Child;
}

function epic(key: string, over: Partial<EpicWithChildren>): EpicWithChildren {
  return {
    key,
    summary: `Épica ${key}`,
    status: 'En curso',
    assigneeRaw: null,
    createdAt: new Date('2025-12-01T00:00:00Z'),
    children: [],
    startDate: null,
    dueDate: null,
    resolvedAt: null,
    ...over,
  } as EpicWithChildren;
}

const rows = analyzeIssues([], [], baseSettings(), NOW);

function stats(epicIndex: Record<string, EpicWithChildren>, initiatives: Array<{ name: string; slug: string; epics: string[] }>) {
  return initiativeStats(initiatives, epicIndex, rows, WEEKS, NOW, baseSettings(), { jiraBrowseUrl: BROWSE });
}

// MAIN-10: 01/01 → 11/04 (70 % transcurrido), 1 de 4 hechas (25 %) → en riesgo (45 pts).
const MAIN_10 = epic('MAIN-10', {
  startDate: '2026-01-01',
  dueDate: '2026-04-11',
  children: [
    child('MAIN-11', 'Finalizada', { storyPoints: 5 }),
    child('MAIN-12', 'En curso', { storyPoints: 3, dueDate: '2026-03-20' }),
    child('MAIN-13', 'Por hacer', { dueDate: '2026-03-25' }),
    child('MAIN-14', 'Por hacer'),
  ],
});
// MAIN-20: 01/02 → 30/04, abierta, sin hijos.
const MAIN_20 = epic('MAIN-20', { startDate: '2026-02-01', dueDate: '2026-04-30' });
// OPS-1: cerrada el 05/03 con fin 01/03 → cerrada tarde.
const OPS_1 = epic('OPS-1', {
  status: 'Finalizada',
  startDate: '2026-01-10',
  dueDate: '2026-03-01',
  resolvedAt: new Date('2026-03-05T12:00:00Z'),
  children: [child('OPS-2', 'Finalizada', { storyPoints: 2 })],
});
// OPS-5: cerrada el 20/02, fin 10/03 → a tiempo.
const OPS_5 = epic('OPS-5', {
  status: 'Finalizada',
  startDate: '2026-01-05',
  dueDate: '2026-03-10',
  resolvedAt: new Date('2026-02-20T08:00:00Z'),
});
// MAIN-30: sin fechas.
const MAIN_30 = epic('MAIN-30', { children: [child('MAIN-31', 'Por hacer')] });
// MAIN-40: fin 01/03 ya pasado, abierta.
const MAIN_40 = epic('MAIN-40', { startDate: '2026-01-01', dueDate: '2026-03-01', children: [child('MAIN-41', 'Finalizada')] });

const INDEX = { 'MAIN-10': MAIN_10, 'MAIN-20': MAIN_20, 'OPS-1': OPS_1, 'OPS-5': OPS_5, 'MAIN-30': MAIN_30, 'MAIN-40': MAIN_40 };

describe('initiativeStats — plazos por iniciativa', () => {
  it('una épica: fechas, estado en riesgo, días restantes, estimación y enlace a Jira', () => {
    const [s] = stats(INDEX, [{ name: 'Pagos', slug: 'pagos', epics: ['MAIN-10'] }]);
    expect(s.pctDone).toBe(25);
    expect(s).toMatchObject({
      startDate: '2026-01-01',
      targetDate: '2026-04-11',
      closedAt: null,
      schedule: 'at_risk',
      closedLate: false,
      daysLeft: 30,
      jiraKey: 'MAIN-10',
      jiraUrl: `${BROWSE}MAIN-10`,
      estimation: { pointsOpen: 3, withPoints: 1, withDueOnly: 1, unestimated: 1, open: 3 },
    });
  });

  it('varias épicas: inicio más temprano, fin más tardío; jiraUrl = primera épica; estimación sumada', () => {
    const [s] = stats(INDEX, [{ name: 'Cobros', slug: 'cobros', epics: ['MAIN-20', 'MAIN-10', 'OPS-1'] }]);
    expect(s.startDate).toBe('2026-01-01');
    expect(s.targetDate).toBe('2026-04-30');
    expect(s.closedAt).toBeNull();
    expect(s.jiraKey).toBe('MAIN-20');
    expect(s.jiraUrl).toBe(`${BROWSE}MAIN-20`);
    expect(s.daysLeft).toBe(49);
    expect(s.estimation).toEqual({ pointsOpen: 3, withPoints: 1, withDueOnly: 1, unestimated: 1, open: 3 });
    // 01/01 → 30/04 = 119 días; 70 transcurridos ≈ 58,8 %; avance 2/5 = 40 % → 18,8 pts → en plazo.
    expect(s.pctDone).toBe(40);
    expect(s.schedule).toBe('on_track');
  });

  it('cerrada solo si todas sus épicas están hechas; closedAt = resolución más tardía; closedLate', () => {
    const [late, onTime] = stats(INDEX, [
      { name: 'Migración', slug: 'migracion', epics: ['OPS-1', 'OPS-5'] },
      { name: 'Facturas', slug: 'facturas', epics: ['OPS-5'] },
    ]);
    expect(late.schedule).toBe('closed');
    expect(late.closedAt).toBe('2026-03-05T12:00:00.000Z');
    expect(late.targetDate).toBe('2026-03-10');
    expect(late.closedLate).toBe(false); // 05/03 ≤ 10/03 (fin agregado = el más tardío)
    expect(onTime.schedule).toBe('closed');
    expect(onTime.closedLate).toBe(false);

    const [alone] = stats(INDEX, [{ name: 'Solo OPS-1', slug: 'ops-1', epics: ['OPS-1'] }]);
    expect(alone.closedLate).toBe(true); // 05/03 > 01/03
    expect(alone.daysLeft).toBe(-11);
  });

  it('sin fechas → no_dates, daysLeft null; vencida → overdue', () => {
    const [none, overdue] = stats(INDEX, [
      { name: 'Sin fechas', slug: 'sin-fechas', epics: ['MAIN-30'] },
      { name: 'Vencida', slug: 'vencida', epics: ['MAIN-40'] },
    ]);
    expect(none).toMatchObject({ startDate: null, targetDate: null, schedule: 'no_dates', daysLeft: null });
    expect(none.estimation).toEqual({ pointsOpen: 0, withPoints: 0, withDueOnly: 0, unestimated: 1, open: 1 });
    expect(overdue).toMatchObject({ schedule: 'overdue', daysLeft: -11 });
  });

  it('sin URL de Jira configurada, jiraUrl es null (la clave se mantiene)', () => {
    const [s] = initiativeStats([{ name: 'Pagos', slug: 'pagos', epics: ['MAIN-10'] }], INDEX, rows, WEEKS, NOW, baseSettings());
    expect(s.jiraKey).toBe('MAIN-10');
    expect(s.jiraUrl).toBeNull();
  });
});

describe('initiativeStats — plazos por épica (epics[])', () => {
  it('cada épica trae sus propias fechas, estado, días, estimación y enlace', () => {
    const [s] = stats(INDEX, [{ name: 'Cobros', slug: 'cobros', epics: ['MAIN-10', 'OPS-1'] }]);
    const [m10, o1] = s.epics;
    expect(m10).toMatchObject({
      key: 'MAIN-10',
      startDate: '2026-01-01',
      targetDate: '2026-04-11',
      closedAt: null,
      schedule: 'at_risk',
      closedLate: false,
      daysLeft: 30,
      jiraUrl: `${BROWSE}MAIN-10`,
      estimation: { pointsOpen: 3, withPoints: 1, withDueOnly: 1, unestimated: 1, open: 3 },
    });
    expect(o1).toMatchObject({
      key: 'OPS-1',
      schedule: 'closed',
      closedAt: '2026-03-05T12:00:00.000Z',
      closedLate: true,
      jiraUrl: `${BROWSE}OPS-1`,
      estimation: { pointsOpen: 0, withPoints: 0, withDueOnly: 0, unestimated: 0, open: 0 },
    });
  });

  it('los campos existentes siguen ahí', () => {
    const [s] = stats(INDEX, [{ name: 'Pagos', slug: 'pagos', epics: ['MAIN-10'] }]);
    expect(Object.keys(s)).toEqual(expect.arrayContaining(['name', 'slug', 'epics', 'childrenTotal', 'childrenByMacro', 'pctDone', 'open', 'done', 'issues']));
    expect(Object.keys(s.epics[0]!)).toEqual(expect.arrayContaining(['key', 'summary', 'status', 'childrenTotal', 'childrenByMacro', 'pctDone']));
  });
});

describe('homeSummary — entradas rag con plazos', () => {
  it('cada entrada añade fechas, plazo, días, enlace y estimación; ragCounts intacto', () => {
    const list = stats(INDEX, [
      { name: 'Pagos', slug: 'pagos', epics: ['MAIN-10'] },
      { name: 'Sin fechas', slug: 'sin-fechas', epics: ['MAIN-30'] },
    ]);
    const home = homeSummary(rows, [], { now: NOW, settings: baseSettings(), initiativesList: list, gh: null });
    expect(home.ragCounts).toEqual(expect.objectContaining({ green: expect.any(Number), amber: expect.any(Number), red: expect.any(Number) }));
    const [pagos, sinFechas] = home.rag;
    expect(pagos).toMatchObject({
      name: 'Pagos',
      slug: 'pagos',
      pct: 25,
      color: expect.any(String),
      reason: expect.any(String),
      startDate: '2026-01-01',
      targetDate: '2026-04-11',
      schedule: 'at_risk',
      closedLate: false,
      daysLeft: 30,
      jiraKey: 'MAIN-10',
      jiraUrl: `${BROWSE}MAIN-10`,
      estimation: { pointsOpen: 3, withPoints: 1, withDueOnly: 1, unestimated: 1, open: 3 },
    });
    expect(sinFechas).toMatchObject({ schedule: 'no_dates', startDate: null, targetDate: null, daysLeft: null });
  });
});
