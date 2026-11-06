import { describe, expect, it } from 'vitest';
import { bucketItems, bucketSeries } from '../src/lib/timeBuckets';
import { bucketMerged } from '../src/lib/prBuckets';

interface Ticket {
  id: number;
  createdAt: string | null;
  resolvedAt: string | null;
  points?: number;
}

const tickets: Ticket[] = [
  { id: 1, createdAt: '2026-01-05T09:00:00Z', resolvedAt: '2026-01-20T09:00:00Z', points: 3 },
  { id: 2, createdAt: '2026-01-25T09:00:00Z', resolvedAt: null, points: 5 },
  { id: 3, createdAt: '2026-03-02T09:00:00Z', resolvedAt: '2026-03-03T09:00:00Z', points: 1 },
  { id: 4, createdAt: null, resolvedAt: '2026-02-10T09:00:00Z' },
  { id: 5, createdAt: 'not a date', resolvedAt: null },
];

describe('bucketItems (custom date accessor)', () => {
  it('counts items by month using any date field', () => {
    const b = bucketItems(tickets, (t) => t.createdAt, 'month', { from: null, to: null });
    expect(b.map((x) => [x.key, x.count])).toEqual([
      ['2026-01', 2],
      ['2026-02', 0],
      ['2026-03', 1],
    ]);
  });

  it('sums an optional value accessor instead of counting', () => {
    const b = bucketItems(tickets, (t) => t.createdAt, 'month', { from: '2026-01-01', to: '2026-01-31' }, (t) => t.points ?? 0);
    expect(b).toEqual([{ key: '2026-01', label: '01-2026', count: 8 }]);
  });

  it('matches bucketMerged for PRs (prBuckets stays a thin wrapper)', () => {
    const prs = [{ merged: '2026-01-05T09:00:00Z' }, { merged: null }, { merged: '2026-02-10T00:00:00Z' }];
    const range = { from: '2026-01-01', to: '2026-02-28' };
    expect(bucketMerged(prs, 'week', range)).toEqual(bucketItems(prs, (p) => p.merged, 'week', range));
  });
});

describe('bucketSeries (several datasets on one axis)', () => {
  it('shares the axis across series and keeps empty buckets', () => {
    const s = bucketSeries(
      tickets,
      [{ date: (t) => t.createdAt }, { date: (t) => t.resolvedAt }],
      'month',
      { from: null, to: null },
    );
    expect(s.keys).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(s.labels).toEqual(['01-2026', '02-2026', '03-2026']);
    expect(s.values).toEqual([
      [2, 0, 1],
      [1, 1, 1],
    ]);
    expect(s.totals).toEqual([3, 3]);
  });

  it('respects the range and per-series value accessors', () => {
    const s = bucketSeries(
      tickets,
      [{ date: (t) => t.createdAt, value: (t) => t.points ?? 0 }, { date: (t) => t.resolvedAt }],
      'year',
      { from: '2026-01-10', to: '2026-12-31' },
    );
    expect(s.keys).toEqual(['2026']);
    expect(s.values).toEqual([[6], [3]]);
  });

  it('returns no buckets when there is no data and no bounds', () => {
    expect(bucketSeries([] as Ticket[], [{ date: (t) => t.createdAt }], 'week', { from: null, to: null }).keys).toEqual([]);
  });
});
