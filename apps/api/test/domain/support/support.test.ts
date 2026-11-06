import { describe, it, expect } from 'vitest';
import { supportByBoard, supportSummary, type SupportInput, type SupportTicketInput } from '../../../src/domain/metrics/support.js';

const BASE = new Date('2026-01-05T00:00:00Z'); // lunes, 2026-W02
const t = (h: number) => new Date(BASE.getTime() + h * 3_600_000);
const NOW = t(648); // 2026-02-01T00:00Z
const window = { from: new Date('2026-01-01T00:00:00Z'), to: NOW };

function ticket(p: Partial<SupportTicketInput> & { key: string }): SupportTicketInput {
  return {
    summary: `summary ${p.key}`,
    type: 'Bug',
    status: 'To Do',
    priority: 'High',
    labels: [],
    createdAt: t(0),
    resolvedAt: null,
    linkedKeys: [],
    statusChanges: [],
    ...p,
  };
}
const ch = (h: number, from: string | null, to: string) => ({ at: t(h), from, to });

const TICKETS: SupportTicketInput[] = [
  // Resuelto rápido, enlazado al tablero principal.
  ticket({
    key: 'SUP-1',
    status: 'Done',
    labels: ['login'],
    linkedKeys: ['MAIN-1'],
    resolvedAt: t(10),
    statusChanges: [ch(2, 'To Do', 'In Progress'), ch(10, 'In Progress', 'Done')],
  }),
  // Reabierto (sale de Done); alias 'Por hacer' -> To Do.
  ticket({
    key: 'SUP-2',
    status: 'Done',
    labels: ['login', 'billing'],
    createdAt: t(24),
    resolvedAt: t(100),
    statusChanges: [ch(30, 'Por hacer', 'Done'), ch(40, 'Done', 'In Progress'), ch(100, 'In Progress', 'Done')],
  }),
  // Escalado y sigue abierto; sin prioridad; cambio Backlog->Por hacer (To Do->To Do) ignorado.
  ticket({
    key: 'SUP-3',
    type: 'Task',
    status: 'Escalated',
    priority: null,
    labels: ['billing'],
    createdAt: t(48),
    statusChanges: [ch(49, 'Backlog', 'Por hacer'), ch(52, 'To Do', 'Escalated')],
  }),
  // Escalado dos veces y resuelto; enlaza a MAIN y a otro proyecto.
  ticket({
    key: 'SUP-4',
    type: 'Task',
    status: 'Done',
    priority: 'Low',
    createdAt: t(72),
    resolvedAt: t(95),
    linkedKeys: ['MAIN-2', 'OTHER-3'],
    statusChanges: [
      ch(73, 'To Do', 'Escalated'),
      ch(83, 'Escalated', 'In Progress'),
      ch(90, 'In Progress', 'Escalated'),
      ch(95, 'Escalated', 'Done'),
    ],
  }),
  // Abierto viejo, fuera de la cohorte.
  ticket({ key: 'SUP-5', labels: ['login'], createdAt: new Date('2025-12-01T00:00:00Z') }),
  // Abierto reciente (48 h), sin cambios.
  ticket({ key: 'SUP-6', status: 'Por hacer', priority: 'Low', createdAt: t(600) }),
];

const INPUT: SupportInput = {
  project: 'SUP',
  tickets: TICKETS,
  devProjects: ['MAIN'],
  techStatus: 'Escalated',
  sla: { High: { firstResponseHours: 4, resolutionHours: 24 }, Low: { resolutionHours: 48 } },
  aliases: { 'Por hacer': 'To Do', Backlog: 'To Do' },
  finalStatus: 'Done',
  now: NOW,
};

const s = supportSummary(INPUT, window);

describe('supportSummary · totals', () => {
  it('counts the cohort, resolved in window and open now', () => {
    expect(s.window).toEqual({ from: window.from.toISOString(), to: NOW.toISOString() });
    expect(s.configured).toBe(true);
    expect(s.project).toBe('SUP');
    expect(s.totals.received).toBe(5);
    expect(s.totals.resolved).toBe(3);
    expect(s.totals.openNow).toBe(3);
  });

  it('escalated, reopened and linked-to-main percentages over the cohort', () => {
    expect(s.totals.escalatedPct).toBeCloseTo(0.4);
    expect(s.totals.reopenedPct).toBeCloseTo(0.2);
    expect(s.totals.linkedToDevPct).toBeCloseTo(0.4);
  });

  it('null escalated/linked when tech status or dev boards are not configured', () => {
    const r = supportSummary({ ...INPUT, techStatus: null, devProjects: [] }, window);
    expect(r.totals.escalatedPct).toBeNull();
    expect(r.totals.linkedToDevPct).toBeNull();
    expect(r.times.techTimeH).toEqual({ p50: null, p85: null });
    expect(r.open.every((o) => !o.escalated)).toBe(true);
  });

  it('linked-to-dev counts links to any dev board', () => {
    // SUP-1 -> MAIN-1, SUP-4 -> MAIN-2 / OTHER-3: con OTHER también como dev no cambia; solo OTHER -> 1/5.
    expect(supportSummary({ ...INPUT, devProjects: ['MAIN', 'OTHER'] }, window).totals.linkedToDevPct).toBeCloseTo(0.4);
    expect(supportSummary({ ...INPUT, devProjects: ['OTHER'] }, window).totals.linkedToDevPct).toBeCloseTo(0.2);
  });

  it('project null (Todos) keeps configured true', () => {
    const r = supportSummary({ ...INPUT, project: null }, window);
    expect(r.configured).toBe(true);
    expect(r.project).toBeNull();
    expect(r.totals.received).toBe(5);
  });
});

describe('supportSummary · times', () => {
  it('first action ignores from===to changes after alias normalization', () => {
    // SUP-1 2, SUP-2 6, SUP-3 4 (no 1), SUP-4 1; SUP-6 sin cambios.
    expect(s.times.firstActionH.p50).toBe(3);
    expect(s.times.firstActionH.p85).toBeCloseTo(5.1);
  });

  it('resolution over the resolved cohort', () => {
    expect(s.times.resolutionH.p50).toBe(23);
  });

  it('tech time sums every stay in techStatus; open stays count until now', () => {
    // SUP-3: 52 -> 648 = 596; SUP-4: 10 + 5 = 15.
    expect(s.times.techTimeH.p50).toBe(305.5);
  });
});

describe('supportSummary · weekly', () => {
  it('one row per ISO week of the window', () => {
    expect(s.weekly.map((w) => w.week)).toEqual(['2026-W01', '2026-W02', '2026-W03', '2026-W04', '2026-W05']);
    expect(s.weekly[1]).toEqual({ week: '2026-W02', received: 4, resolved: 3 });
    expect(s.weekly[4]).toEqual({ week: '2026-W05', received: 1, resolved: 0 });
    expect(s.weekly[0]).toEqual({ week: '2026-W01', received: 0, resolved: 0 });
  });
});

describe('supportSummary · breakdowns', () => {
  it('byPriority with SLA met/breached and null priority bucket', () => {
    expect(s.byPriority).toEqual([
      {
        priority: 'High',
        count: 2,
        resolutionP50H: 43,
        firstResponseTargetH: 4,
        firstResponseMetPct: 0.5,
        resolutionTargetH: 24,
        resolutionMetPct: 0.5,
      },
      {
        priority: 'Low',
        count: 2,
        resolutionP50H: 23,
        firstResponseTargetH: null,
        firstResponseMetPct: null,
        resolutionTargetH: 48,
        resolutionMetPct: 1,
      },
      {
        priority: 'Sin prioridad',
        count: 1,
        resolutionP50H: null,
        firstResponseTargetH: null,
        firstResponseMetPct: null,
        resolutionTargetH: null,
        resolutionMetPct: null,
      },
    ]);
  });

  it('byLabel (cohort) and byType', () => {
    expect(s.byLabel).toEqual([
      { label: 'billing', count: 2, openNow: 1 },
      { label: 'login', count: 2, openNow: 0 },
    ]);
    expect(s.byType).toEqual([
      { type: 'Bug', count: 3 },
      { type: 'Task', count: 2 },
    ]);
  });

  it('byLabel keeps the top 10', () => {
    const many = Array.from({ length: 12 }, (_, i) => ticket({ key: `SUP-${100 + i}`, labels: [`l${i}`] }));
    const r = supportSummary({ ...INPUT, tickets: many }, window);
    expect(r.byLabel).toHaveLength(10);
  });
});

describe('supportSummary · sla', () => {
  it('aggregates over priorities with targets and lists breached open tickets', () => {
    expect(s.sla.configured).toBe(true);
    expect(s.sla.firstResponseMetPct).toBe(0.5);
    expect(s.sla.resolutionMetPct).toBeCloseTo(2 / 3);
    // SUP-5 (High, 1488 h > 24); SUP-6 (Low, 48 h, no > 48); SUP-3 sin objetivo.
    expect(s.sla.breachedOpen).toEqual([
      { key: 'SUP-5', summary: 'summary SUP-5', priority: 'High', ageH: 1488, targetH: 24 },
    ]);
  });

  it('not configured when there are no targets', () => {
    const r = supportSummary({ ...INPUT, sla: {} }, window);
    expect(r.sla).toEqual({ configured: false, firstResponseMetPct: null, resolutionMetPct: null, breachedOpen: [] });
    expect(r.byPriority[0].resolutionTargetH).toBeNull();
  });
});

describe('supportSummary · aging', () => {
  it('buckets and open list sorted by age desc', () => {
    expect(s.aging).toEqual({ lt2d: 0, d2to7: 1, d7to30: 1, gt30d: 1 });
    expect(s.open).toEqual([
      { key: 'SUP-5', summary: 'summary SUP-5', priority: 'High', status: 'To Do', ageH: 1488, escalated: false },
      { key: 'SUP-3', summary: 'summary SUP-3', priority: null, status: 'Escalated', ageH: 600, escalated: true },
      { key: 'SUP-6', summary: 'summary SUP-6', priority: 'Low', status: 'To Do', ageH: 48, escalated: false },
    ]);
  });

  it('exposes Spanish definitions', () => {
    for (const k of ['firstAction', 'resolution', 'escalated', 'reopened', 'slaMet', 'hours']) {
      expect(typeof s.definitions[k]).toBe('string');
    }
  });
});

describe('supportByBoard', () => {
  it('one row per support board with its own totals over the window', () => {
    const help = [
      ticket({ key: 'HELP-1', createdAt: t(1), resolvedAt: t(5), status: 'Done' }),
      ticket({ key: 'HELP-2', createdAt: t(2) }),
    ];
    const rows = supportByBoard({ ...INPUT, tickets: [...TICKETS, ...help] }, ['SUP', 'HELP', 'NONE'], window);
    expect(rows.map((r) => r.board)).toEqual(['SUP', 'HELP', 'NONE']);
    expect(rows[0]).toMatchObject({ received: 5, resolved: 3, openNow: 3, escalatedPct: 0.4 });
    expect(rows[1]).toMatchObject({ board: 'HELP', received: 2, resolved: 1, openNow: 1, resolutionP50H: 4, escalatedPct: 0 });
    expect(rows[2]).toMatchObject({ board: 'NONE', received: 0, resolved: 0, openNow: 0, resolutionP50H: null, escalatedPct: null });
  });
});
