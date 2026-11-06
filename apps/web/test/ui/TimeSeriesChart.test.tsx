// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

interface DS {
  label: string;
  data: number[];
}
vi.mock('../../src/components/charts/BarChart', () => ({
  BarChart: ({ data }: { data: { labels: string[]; datasets: DS[] } }) => (
    <div
      data-testid="bar-chart"
      data-labels={data.labels.join('|')}
      data-series={data.datasets.map((d) => `${d.label}:${d.data.join(',')}`).join(';')}
    />
  ),
}));
vi.mock('../../src/components/charts/LineChart', () => ({
  LineChart: ({ data }: { data: { labels: string[]; datasets: DS[] } }) => (
    <div data-testid="line-chart" data-labels={data.labels.join('|')} />
  ),
}));

import { TimeSeriesChart, loadChartPrefs } from '../../src/components/ui/TimeSeriesChart';

const NOW = new Date('2026-11-06T12:00:00Z');
const KEY = 'devboard.demo.chart';

interface Item {
  opened: string;
  closed: string | null;
}
const ITEMS: Item[] = [
  { opened: '2026-09-02T10:00:00Z', closed: '2026-09-10T10:00:00Z' },
  { opened: '2026-10-05T10:00:00Z', closed: null },
  { opened: '2026-10-20T10:00:00Z', closed: '2026-11-02T10:00:00Z' },
];

describe('TimeSeriesChart', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the toolbar and a single series with its title and total', () => {
    render(
      <TimeSeriesChart
        items={ITEMS}
        date={(i) => i.opened}
        label="Opened"
        unit="opened"
        title={(noun) => `Items per ${noun}`}
        storageKey={KEY}
        defaults={{ granularity: 'month', preset: '3m' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Items per mes' })).toBeTruthy();
    expect(screen.getByText('3 opened')).toBeTruthy();
    for (const name of ['Barras', 'Línea', 'Día', 'Semana', 'Mes', 'Año']) expect(screen.getByRole('button', { name })).toBeTruthy();
    const range = screen.getByLabelText('Rango') as HTMLSelectElement;
    expect(range.value).toBe('3m');
    expect([...range.options].map((o) => o.textContent)).toEqual(['4 semanas', '3 meses', '6 meses', '12 meses', 'Todo', 'Personalizado']);
    expect(screen.getByLabelText('Desde')).toBeTruthy();
    expect(screen.getByLabelText('Hasta')).toBeTruthy();
    expect(screen.getByTestId('bar-chart').dataset.series).toBe('Opened:0,1,2,0');
  });

  it('draws several series on a shared axis', () => {
    render(
      <TimeSeriesChart
        items={ITEMS}
        series={[
          { label: 'Received', date: (i) => i.opened },
          { label: 'Resolved', date: (i) => i.closed },
        ]}
        title={(noun) => `Flow per ${noun}`}
        storageKey={KEY}
        defaults={{ granularity: 'month', preset: '3m' }}
      />,
    );
    const chart = screen.getByTestId('bar-chart');
    expect(chart.dataset.labels).toBe('08-2026|09-2026|10-2026|11-2026');
    expect(chart.dataset.series).toBe('Received:0,1,2,0;Resolved:0,1,0,1');
    expect(screen.getByText('Received: 3 · Resolved: 2')).toBeTruthy();
  });

  it('saves choices under its own storage key', () => {
    render(<TimeSeriesChart items={ITEMS} date={(i) => i.opened} title={(n) => `T ${n}`} storageKey={KEY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Año' }));
    fireEvent.click(screen.getByRole('button', { name: 'Línea' }));
    expect(screen.getByTestId('line-chart')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ granularity: 'year', type: 'line' });
    expect(localStorage.getItem('devboard.cr.chart')).toBeNull();
  });

  it('applies saved prefs over defaults; a date switches to custom', () => {
    localStorage.setItem(KEY, JSON.stringify({ granularity: 'month', preset: 'all' }));
    render(<TimeSeriesChart items={ITEMS} date={(i) => i.opened} title={(n) => `T ${n}`} storageKey={KEY} defaults={{ granularity: 'day' }} />);
    expect(screen.getByRole('heading', { name: 'T mes' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    expect((screen.getByLabelText('Rango') as HTMLSelectElement).value).toBe('custom');
    expect(screen.getByTestId('bar-chart').dataset.labels).toBe('10-2026|11-2026');
  });

  it('shows the empty text when nothing falls in range', () => {
    render(
      <TimeSeriesChart items={[] as Item[]} date={(i) => i.opened} title={(n) => n} storageKey={KEY} emptyText="Nothing here." defaults={{ preset: 'all' }} />,
    );
    expect(screen.getByText('Nothing here.')).toBeTruthy();
  });

  it('loadChartPrefs falls back to the given defaults on corrupt data', () => {
    localStorage.setItem(KEY, '{bad');
    expect(loadChartPrefs(KEY, { type: 'line', granularity: 'month', preset: '6m', from: null, to: null })).toEqual({
      type: 'line',
      granularity: 'month',
      preset: '6m',
      from: null,
      to: null,
    });
  });
});
