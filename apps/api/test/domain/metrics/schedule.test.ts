/**
 * Contrato del dominio de plazos (fechas de iniciativa/épica), estado de calendario y estimación.
 * Funciones puras en `src/domain/metrics/schedule.ts`; "hoy" siempre inyectado (`now`).
 * Fechas de Jira como `YYYY-MM-DD`; "hoy" = fecha de calendario UTC de `now`.
 */
import { describe, it, expect } from 'vitest';
import {
  AT_RISK_GAP_POINTS,
  aggregateEpicDates,
  closedLate,
  daysLeft,
  elapsedPct,
  estimationOf,
  scheduleStatus,
  type ScheduleInput,
} from '../../../src/domain/metrics/schedule.js';

// Jueves 12/03/2026, 10:00 UTC.
const NOW = new Date('2026-03-12T10:00:00Z');

// 01/01/2026 → 11/04/2026 son exactamente 100 días; el 12/03 han pasado 70 (70 %).
const START = '2026-01-01';
const END_100 = '2026-04-11';

function input(over: Partial<ScheduleInput> = {}): ScheduleInput {
  return { startDate: START, targetDate: END_100, closed: false, progressPct: 50, ...over };
}

describe('elapsedPct', () => {
  it('(hoy − inicio) / (fin − inicio) en días de calendario, en %', () => {
    expect(elapsedPct(START, END_100, NOW)).toBeCloseTo(70, 6);
  });

  it('se recorta a 0 antes del inicio y a 100 después del fin', () => {
    expect(elapsedPct('2026-04-01', '2026-06-30', NOW)).toBe(0);
    expect(elapsedPct('2025-10-01', '2026-01-31', NOW)).toBe(100);
  });

  it('el día del fin es 100 %', () => {
    expect(elapsedPct(START, '2026-03-12', NOW)).toBe(100);
  });

  it('null si falta inicio o fin', () => {
    expect(elapsedPct(null, END_100, NOW)).toBeNull();
    expect(elapsedPct(START, null, NOW)).toBeNull();
  });
});

describe('scheduleStatus — precedencia closed > no_dates > overdue > at_risk > on_track', () => {
  it('umbral «en riesgo» = 40 puntos', () => {
    expect(AT_RISK_GAP_POINTS).toBe(40);
  });

  it('closed: gana aunque falten fechas o esté vencida', () => {
    expect(scheduleStatus(input({ closed: true }), NOW)).toBe('closed');
    expect(scheduleStatus(input({ closed: true, startDate: null, targetDate: null }), NOW)).toBe('closed');
    expect(scheduleStatus(input({ closed: true, targetDate: '2026-02-01', progressPct: 0 }), NOW)).toBe('closed');
  });

  it('no_dates: falta inicio O fin (antes que overdue)', () => {
    expect(scheduleStatus(input({ startDate: null }), NOW)).toBe('no_dates');
    expect(scheduleStatus(input({ targetDate: null }), NOW)).toBe('no_dates');
    expect(scheduleStatus(input({ startDate: null, targetDate: null }), NOW)).toBe('no_dates');
    // Fin ya pasado pero sin inicio: sigue siendo «Sin fecha», no «Vencida».
    expect(scheduleStatus(input({ startDate: null, targetDate: '2026-02-01', progressPct: 0 }), NOW)).toBe('no_dates');
  });

  it('overdue: fin < hoy y no cerrada, aunque el avance sea 100 %', () => {
    expect(scheduleStatus(input({ targetDate: '2026-03-11', progressPct: 100 }), NOW)).toBe('overdue');
    expect(scheduleStatus(input({ targetDate: '2026-02-01', progressPct: 0 }), NOW)).toBe('overdue');
  });

  it('el día del fin todavía no está vencida', () => {
    expect(scheduleStatus(input({ targetDate: '2026-03-12', progressPct: 100 }), NOW)).toBe('on_track');
  });

  it('at_risk: transcurrido% − avance% ≥ 40 (70 % transcurrido, 30 % hecho)', () => {
    expect(scheduleStatus(input({ progressPct: 30 }), NOW)).toBe('at_risk');
    expect(scheduleStatus(input({ progressPct: 0 }), NOW)).toBe('at_risk');
  });

  it('frontera: 40 puntos es riesgo, 39 no', () => {
    expect(scheduleStatus(input({ progressPct: 30 }), NOW)).toBe('at_risk'); // 70 − 30 = 40
    expect(scheduleStatus(input({ progressPct: 31 }), NOW)).toBe('on_track'); // 70 − 31 = 39
  });

  it('el día del fin: 100 % transcurrido; 60 % hecho = riesgo, 61 % = en plazo', () => {
    expect(scheduleStatus(input({ targetDate: '2026-03-12', progressPct: 60 }), NOW)).toBe('at_risk');
    expect(scheduleStatus(input({ targetDate: '2026-03-12', progressPct: 61 }), NOW)).toBe('on_track');
  });

  it('antes del inicio el transcurrido se recorta a 0: nunca en riesgo', () => {
    expect(scheduleStatus(input({ startDate: '2026-04-01', targetDate: '2026-06-30', progressPct: 0 }), NOW)).toBe('on_track');
  });

  it('on_track en el resto de casos', () => {
    expect(scheduleStatus(input({ progressPct: 70 }), NOW)).toBe('on_track');
    expect(scheduleStatus(input({ progressPct: 100 }), NOW)).toBe('on_track');
  });

  it('pura: no lee el reloj del sistema', () => {
    const later = new Date('2026-04-12T10:00:00Z');
    expect(scheduleStatus(input({ progressPct: 100 }), NOW)).toBe('on_track');
    expect(scheduleStatus(input({ progressPct: 100 }), later)).toBe('overdue');
  });
});

describe('closedLate', () => {
  it('true si la fecha de cierre es posterior al fin estimado', () => {
    expect(closedLate(new Date('2026-03-13T08:00:00Z'), '2026-03-12')).toBe(true);
  });
  it('cerrar el mismo día del fin no es tarde', () => {
    expect(closedLate(new Date('2026-03-12T20:00:00Z'), '2026-03-12')).toBe(false);
    expect(closedLate(new Date('2026-03-01T08:00:00Z'), '2026-03-12')).toBe(false);
  });
  it('false sin fin estimado o sin cierre', () => {
    expect(closedLate(new Date('2026-03-13T08:00:00Z'), null)).toBe(false);
    expect(closedLate(null, '2026-03-12')).toBe(false);
  });
});

describe('daysLeft', () => {
  it('días de calendario de hoy al fin; negativo si vencida; 0 el mismo día', () => {
    expect(daysLeft('2026-03-22', NOW)).toBe(10);
    expect(daysLeft('2026-03-12', NOW)).toBe(0);
    expect(daysLeft('2026-03-02', NOW)).toBe(-10);
  });
  it('no depende de la hora del día', () => {
    expect(daysLeft('2026-03-22', new Date('2026-03-12T00:00:01Z'))).toBe(10);
    expect(daysLeft('2026-03-22', new Date('2026-03-12T23:59:59Z'))).toBe(10);
  });
  it('null sin fin', () => {
    expect(daysLeft(null, NOW)).toBeNull();
  });
});

describe('aggregateEpicDates — iniciativa sobre varias épicas', () => {
  const open = { startDate: '2026-02-01', targetDate: '2026-05-01', done: false, resolvedAt: null };
  const doneEarly = { startDate: '2026-01-15', targetDate: '2026-04-01', done: true, resolvedAt: new Date('2026-03-01T09:00:00Z') };
  const noDates = { startDate: null, targetDate: null, done: false, resolvedAt: null };

  it('inicio = el más temprano, fin = el más tardío (ignorando épicas sin fecha)', () => {
    expect(aggregateEpicDates([open, doneEarly, noDates])).toEqual({
      startDate: '2026-01-15',
      targetDate: '2026-05-01',
      closed: false,
      closedAt: null,
    });
  });

  it('cerrada solo si TODAS las épicas están hechas; closedAt = la resolución más tardía', () => {
    const doneLate = { startDate: '2026-02-01', targetDate: '2026-03-01', done: true, resolvedAt: new Date('2026-03-05T12:00:00Z') };
    const agg = aggregateEpicDates([doneEarly, doneLate]);
    expect(agg.closed).toBe(true);
    expect(agg.closedAt?.toISOString()).toBe('2026-03-05T12:00:00.000Z');
    expect(agg.startDate).toBe('2026-01-15');
    expect(agg.targetDate).toBe('2026-04-01');
  });

  it('una épica abierta basta para que no esté cerrada', () => {
    expect(aggregateEpicDates([doneEarly, open]).closed).toBe(false);
  });

  it('sin épicas: sin fechas y no cerrada', () => {
    expect(aggregateEpicDates([])).toEqual({ startDate: null, targetDate: null, closed: false, closedAt: null });
  });
});

describe('estimationOf — hijos abiertos', () => {
  it('puntos (> 0) tienen prioridad sobre la fecha; luego fecha; si no, sin estimar; los hechos no cuentan', () => {
    const est = estimationOf([
      { done: false, storyPoints: 3, dueDate: null }, // puntos
      { done: false, storyPoints: 2, dueDate: '2026-04-01' }, // puntos (gana a la fecha)
      { done: false, storyPoints: null, dueDate: '2026-04-01' }, // solo fecha
      { done: false, storyPoints: 0, dueDate: '2026-04-02' }, // 0 puntos = sin puntos → solo fecha
      { done: false, storyPoints: 0, dueDate: null }, // sin estimar
      { done: false, storyPoints: null, dueDate: null }, // sin estimar
      { done: true, storyPoints: 8, dueDate: '2026-01-01' }, // hecho: excluido
      { done: true, storyPoints: null, dueDate: null }, // hecho: excluido
    ]);
    expect(est).toEqual({ pointsOpen: 5, withPoints: 2, withDueOnly: 2, unestimated: 2, open: 6 });
  });

  it('acepta campos ausentes (undefined) como vacíos', () => {
    expect(estimationOf([{ done: false }, { done: false, storyPoints: 1.5 }])).toEqual({
      pointsOpen: 1.5,
      withPoints: 1,
      withDueOnly: 0,
      unestimated: 1,
      open: 2,
    });
  });

  it('sin hijos abiertos: todo a 0', () => {
    expect(estimationOf([])).toEqual({ pointsOpen: 0, withPoints: 0, withDueOnly: 0, unestimated: 0, open: 0 });
    expect(estimationOf([{ done: true, storyPoints: 5, dueDate: null }])).toEqual({ pointsOpen: 0, withPoints: 0, withDueOnly: 0, unestimated: 0, open: 0 });
  });
});
