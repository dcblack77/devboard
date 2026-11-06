import { describe, expect, it } from 'vitest';
import { bucketKey, bucketLabel, bucketMerged, isoWeek, presetRange } from '../src/lib/prBuckets';

const d = (s: string) => new Date(s);

describe('isoWeek', () => {
  it('usa semanas ISO que empiezan en lunes', () => {
    expect(isoWeek(d('2026-01-01T10:00:00Z'))).toBe('2026-W01'); // jueves
    expect(isoWeek(d('2025-12-29T00:00:00Z'))).toBe('2026-W01'); // lunes de la W01
    expect(isoWeek(d('2025-12-28T23:59:00Z'))).toBe('2025-W52'); // domingo anterior
    expect(isoWeek(d('2021-01-03T12:00:00Z'))).toBe('2020-W53');
  });

  it('agrupa de lunes a domingo', () => {
    expect(isoWeek(d('2026-02-02T00:00:00Z'))).toBe('2026-W06');
    expect(isoWeek(d('2026-02-08T23:59:00Z'))).toBe('2026-W06');
    expect(isoWeek(d('2026-02-09T00:00:00Z'))).toBe('2026-W07');
  });
});

describe('bucketKey / bucketLabel', () => {
  const t = d('2026-02-05T15:00:00Z');
  it('día dd-mm-aa', () => {
    expect(bucketLabel(bucketKey(t, 'day'), 'day')).toBe('05-02-26');
  });
  it('semana con etiqueta ISO', () => {
    expect(bucketLabel(bucketKey(t, 'week'), 'week')).toBe('2026-W06');
  });
  it('mes mm-aaaa', () => {
    expect(bucketLabel(bucketKey(t, 'month'), 'month')).toBe('02-2026');
  });
  it('año', () => {
    expect(bucketLabel(bucketKey(t, 'year'), 'year')).toBe('2026');
  });
});

describe('presetRange', () => {
  const today = d('2026-11-06T12:00:00Z');
  it('calcula el inicio de cada preset (fin = hoy)', () => {
    expect(presetRange('4w', today)).toEqual({ from: '2026-10-09', to: '2026-11-06' });
    expect(presetRange('3m', today)).toEqual({ from: '2026-08-06', to: '2026-11-06' });
    expect(presetRange('6m', today)).toEqual({ from: '2026-05-06', to: '2026-11-06' });
    expect(presetRange('12m', today)).toEqual({ from: '2025-11-06', to: '2026-11-06' });
  });
  it('"Todo" no tiene inicio', () => {
    expect(presetRange('all', today)).toEqual({ from: null, to: '2026-11-06' });
  });
});

describe('bucketMerged', () => {
  const prs = [
    { merged: '2026-01-05T09:00:00Z' },
    { merged: '2026-03-10T09:00:00Z' },
    { merged: '2026-03-31T23:30:00Z' },
    { merged: null },
  ];

  it('agrupa por mes e incluye meses vacíos a 0', () => {
    const b = bucketMerged(prs, 'month', { from: '2026-01-01', to: '2026-04-30' });
    expect(b.map((x) => [x.label, x.count])).toEqual([
      ['01-2026', 1],
      ['02-2026', 0],
      ['03-2026', 2],
      ['04-2026', 0],
    ]);
  });

  it('agrupa por semana ISO con semanas vacías', () => {
    const b = bucketMerged(
      [{ merged: '2026-02-02T08:00:00Z' }, { merged: '2026-02-08T22:00:00Z' }, { merged: '2026-02-16T08:00:00Z' }],
      'week',
      { from: '2026-02-02', to: '2026-02-22' },
    );
    expect(b.map((x) => [x.label, x.count])).toEqual([
      ['2026-W06', 2],
      ['2026-W07', 0],
      ['2026-W08', 1],
    ]);
  });

  it('agrupa por día con extremos inclusivos', () => {
    const b = bucketMerged(prs, 'day', { from: '2026-03-30', to: '2026-03-31' });
    expect(b.map((x) => [x.label, x.count])).toEqual([
      ['30-03-26', 0],
      ['31-03-26', 1],
    ]);
  });

  it('agrupa por año', () => {
    const b = bucketMerged([{ merged: '2024-06-01T00:00:00Z' }, ...prs], 'year', { from: null, to: '2026-11-06' });
    expect(b.map((x) => [x.label, x.count])).toEqual([
      ['2024', 1],
      ['2025', 0],
      ['2026', 3],
    ]);
  });

  it('filtra fuera del rango personalizado', () => {
    const b = bucketMerged(prs, 'month', { from: '2026-03-01', to: '2026-03-15' });
    expect(b).toEqual([{ key: '2026-03', label: '03-2026', count: 1 }]);
  });

  it('sin inicio empieza en la primera mergeada; sin fin acaba en la última', () => {
    const b = bucketMerged(prs, 'month', { from: null, to: null });
    expect(b.map((x) => x.key)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('devuelve vacío si no hay datos ni límites o el rango está invertido', () => {
    expect(bucketMerged([], 'week', { from: null, to: null })).toEqual([]);
    expect(bucketMerged(prs, 'week', { from: '2026-05-01', to: '2026-04-01' })).toEqual([]);
  });
});
