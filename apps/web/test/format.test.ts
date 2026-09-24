import { describe, expect, it } from 'vitest';
import { fmtAgo, fmtDateTime, fmtHours, isoWeekKey, weeklyCounts } from '../src/lib/format';

describe('fmtAgo', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  it('usa minutos, horas y días en lenguaje llano', () => {
    expect(fmtAgo('2026-09-24T09:59:40Z', now)).toBe('ahora mismo');
    expect(fmtAgo('2026-09-24T09:55:00Z', now)).toBe('hace 5 min');
    expect(fmtAgo('2026-09-24T07:00:00Z', now)).toBe('hace 3 h');
    expect(fmtAgo('2026-09-23T09:00:00Z', now)).toBe('hace 1 día');
    expect(fmtAgo('2026-09-11T13:00:00Z', now)).toBe('hace 12 días');
  });
  it('no muestra tiempos negativos ni fechas inválidas', () => {
    expect(fmtAgo('2026-09-24T10:05:00Z', now)).toBe('ahora mismo');
    expect(fmtAgo('x', now)).toBe('—');
    expect(fmtAgo(null, now)).toBe('—');
  });
});

describe('fmtHours', () => {
  it('muestra horas con un decimal cuando son menos de 24', () => {
    expect(fmtHours(5.25)).toBe('5.3 h');
  });

  it('convierte a días cuando son 24 horas o más', () => {
    expect(fmtHours(48)).toBe('2.0 d');
  });

  it('normaliza el cero negativo para evitar mostrar -0.0 h', () => {
    expect(fmtHours(-0)).toBe('0.0 h');
    expect(fmtHours(-0.01)).toBe('0.0 h');
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
