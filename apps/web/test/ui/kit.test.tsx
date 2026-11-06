// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageShell } from '../../src/components/ui/PageShell';
import { KpiGroup } from '../../src/components/ui/KpiGroup';
import { Kpi } from '../../src/components/Kpi';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { PageSkeleton } from '../../src/components/ui/Skeleton';
import { AgeBadge, Avatar, PrCell } from '../../src/components/ui/cells';
import { MODERN_TABLE } from '../../src/components/ui/tables';
import { sumLastWindow, sumPrevWindow, windowDelta, toDelta } from '../../src/lib/deltas';

afterEach(() => cleanup());

describe('PageShell', () => {
  it('renders a wide main with the cr-head header and print button', () => {
    const { container } = render(
      <PageShell title="Demo" lead="Lead text">
        <p>content</p>
      </PageShell>,
    );
    const main = container.querySelector('main')!;
    expect(main.className).toBe('page');
    expect(main.querySelector('.cr-head h1')!.textContent).toBe('Demo');
    expect(main.querySelector('.cr-head .lead')!.textContent).toBe('Lead text');
    expect(screen.getByRole('button', { name: 'Imprimir / PDF' })).toBeTruthy();
  });

  it('accepts extra classes, custom actions and no print button', () => {
    const { container } = render(
      <PageShell title="Demo" className="cr" print={false} actions={<button type="button">Sync</button>}>
        <p />
      </PageShell>,
    );
    expect(container.querySelector('main')!.className).toBe('page cr');
    expect(screen.queryByRole('button', { name: 'Imprimir / PDF' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sync' })).toBeTruthy();
  });
});

describe('KpiGroup', () => {
  it('wraps KPIs under a label', () => {
    const { container } = render(
      <KpiGroup label="Volume">
        <Kpi value={1} label="A" />
        <Kpi value={2} label="B" />
      </KpiGroup>,
    );
    expect(container.innerHTML).toBe(
      '<div class="kpi-group"><p class="kpi-group-label">Volume</p><div class="kpis"><div class="kpi"><div class="v">1</div><div class="l">A</div></div><div class="kpi"><div class="v">2</div><div class="l">B</div></div></div></div>',
    );
  });
});

describe('EmptyState / PageSkeleton', () => {
  it('empty state paragraph', () => {
    const { container } = render(<EmptyState>Nothing yet</EmptyState>);
    expect(container.innerHTML).toBe('<p class="empty-state">Nothing yet</p>');
  });

  it('page skeleton with kpis and block cards', () => {
    const { container } = render(<PageSkeleton label="Loading demo" kpis={4} blocks={3} />);
    const main = container.querySelector('main')!;
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(main.getAttribute('aria-label')).toBe('Loading demo');
    expect(main.className).toBe('page');
    expect(main.querySelectorAll('.kpi')).toHaveLength(4);
    expect(main.querySelectorAll('.cr-pair .card')).toHaveLength(3);
  });
});

describe('cells', () => {
  it('AgeBadge levels and text', () => {
    const { container } = render(<AgeBadge hours={40 * 24} />);
    expect(container.innerHTML).toBe('<span class="age-badge age-old">40 d</span>');
  });

  it('Avatar with initials and name', () => {
    const { container } = render(<Avatar name="Ana García" />);
    expect(container.querySelector('.avatar')!.textContent).toBe('AG');
    expect(container.textContent).toBe('AGAna García');
  });

  it('PrCell two lines', () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <PrCell repo="org/api" number={4} title="Fix" url="https://example.test/4" />
          </tr>
        </tbody>
      </table>,
    );
    expect(container.querySelector('.pr-line1')!.textContent).toBe('#4 Fix');
    expect(container.querySelector('.pr-repo')!.textContent).toBe('org/api');
  });
});

describe('MODERN_TABLE preset', () => {
  it('modern variant with 20/50/100/all page sizes', () => {
    expect(MODERN_TABLE).toEqual({ variant: 'modern', pageSizeOptions: [20, 50, 100, 0] });
  });
});

describe('deltas', () => {
  const w = (n: number) => ({ v: n });
  const weekly = [w(1), w(1), w(1), w(1), w(2), w(2), w(2), w(2)];
  it('sums windows and computes the change', () => {
    expect(sumLastWindow(weekly, 'v', 4)).toBe(8);
    expect(sumPrevWindow(weekly, 'v', 4)).toBe(4);
    expect(windowDelta(weekly, 'v', 4)).toBe(100);
    expect(windowDelta(weekly.slice(1), 'v', 4)).toBeNull();
    expect(toDelta(null, 'up')).toBeNull();
    expect(toDelta(5, 'down')).toEqual({ pct: 5, good: 'down' });
  });
});
