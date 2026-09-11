import { describe, it, expect } from 'vitest';
import { hours, days, mean, weekKey, weekLabels, slugify, formatDays } from '../../../src/domain/metrics/time.js';

describe('hours/days', () => {
  it('calcula horas entre dos fechas', () => {
    expect(hours(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T12:00:00Z'))).toBe(12);
  });

  it('convierte horas a días con un decimal', () => {
    expect(days(36)).toBe(1.5);
    expect(days(null)).toBeNull();
  });
});

describe('mean', () => {
  it('devuelve null en array vacío', () => {
    expect(mean([])).toBeNull();
  });
  it('calcula la media', () => {
    expect(mean([1, 2, 3])).toBe(2);
  });
});

describe('formatDays', () => {
  it('texto para menos de un día', () => {
    expect(formatDays(12)).toBe('<1 día');
  });
  it('singular para 1 día', () => {
    expect(formatDays(24)).toBe('1 día');
  });
  it('plural con decimal para menos de 10 días', () => {
    expect(formatDays(84)).toBe('3.5 días');
  });
  it('sin decimales para 10+ días', () => {
    expect(formatDays(24 * 15)).toBe('15 días');
  });
});

describe('weekKey', () => {
  it('formatea ISO YYYY-Www', () => {
    expect(weekKey(new Date('2026-01-05T00:00:00Z'))).toMatch(/^2026-W\d{2}$/);
  });
  it('lunes y domingo de la misma semana comparten clave', () => {
    const monday = weekKey(new Date('2026-01-05T00:00:00Z'));
    const sunday = weekKey(new Date('2026-01-11T23:00:00Z'));
    expect(monday).toBe(sunday);
  });
});

describe('weekLabels', () => {
  it('devuelve al menos 13 semanas por defecto', () => {
    const labels = weekLabels(new Date('2026-03-01T00:00:00Z'));
    expect(labels.length).toBeGreaterThanOrEqual(13);
  });
  it('la última etiqueta es la semana de "now"', () => {
    const now = new Date('2026-03-02T00:00:00Z');
    const labels = weekLabels(now);
    expect(labels.at(-1)).toBe(weekKey(now));
  });
  it('extiende el rango si "since" es más antiguo', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const since = new Date('2025-01-01T00:00:00Z');
    const labels = weekLabels(now, since);
    expect(labels.length).toBeGreaterThan(13);
  });
});

describe('slugify', () => {
  it('convierte a minúsculas y quita acentos', () => {
    expect(slugify('Ana Pérez')).toBe('ana-perez');
  });
  it('colapsa separadores no alfanuméricos', () => {
    expect(slugify('  Foo   Bar!! ')).toBe('foo-bar');
  });
  it('fallback "x" si queda vacío', () => {
    expect(slugify('???')).toBe('x');
  });
});
