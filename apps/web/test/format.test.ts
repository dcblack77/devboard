import { describe, expect, it } from 'vitest';
import { fmtDateTime, fmtHours, isoWeekKey, weeklyCounts } from '../src/lib/format';

describe('fmtHours', () => {
  it('muestra horas con un decimal cuando son menos de 24', () => {
    expect(fmtHours(5.25)).toBe('5.3 h');
  });

  it('convierte a días cuando son 24 horas o más', () => {
    expect(fmtHours(48)).toBe('2.0 d');
  });

  it('devuelve raya si no hay dato', () => {
    expect(fmtHours(null)).toBe('—');
    expect(fmtHours(undefined)).toBe('—');
  });
});

describe('fmtDateTime', () => {
  it('convierte ISO a fecha y hora breve en español', () => {
    const formatted = fmtDateTime('2024-01-02T10:05:00Z');
    expect(formatted).toMatch(/^02\/01\/2024, \d{2}:\d{2}$/);
  });

  it('devuelve raya cuando falta la fecha o no es válida', () => {
    expect(fmtDateTime(null)).toBe('—');
    expect(fmtDateTime('no-es-una-fecha')).toBe('—');
  });
});

describe('isoWeekKey', () => {
  it('calcula la semana ISO de una fecha conocida', () => {
    // 2024-01-01 es lunes de la semana ISO 2024-W01.
    expect(isoWeekKey(new Date('2024-01-01T00:00:00Z'))).toBe('2024-W01');
  });
});

describe('weeklyCounts', () => {
  it('agrupa fechas por semana ISO y cuenta ocurrencias', () => {
    const result = weeklyCounts([
      '2024-01-01T10:00:00Z',
      '2024-01-02T10:00:00Z',
      '2024-01-08T10:00:00Z',
      null,
      undefined,
    ]);
    expect(result).toEqual([
      { week: '2024-W01', count: 2 },
      { week: '2024-W02', count: 1 },
    ]);
  });

  it('respeta el límite de semanas devueltas', () => {
    const dates = ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22'];
    expect(weeklyCounts(dates, 2)).toHaveLength(2);
  });
});
