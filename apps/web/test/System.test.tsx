// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { System } from '../src/pages/System';

const REPO_ACTIVE = {
  repo: 'org/app',
  deploys: 12,
  deploysPerWeek: 0.25,
  cfr: 0.1,
  hotfixPct: 0,
  leadTimeH: { p50: 48, p85: 96 },
  codingH: 3,
  pickupH: 2,
  reviewH: 6,
  mergeToProdH: 1,
  recoveryH: 30,
};

const REPO_IDLE = {
  repo: 'org/idle',
  deploys: 0,
  deploysPerWeek: 0,
  cfr: null,
  hotfixPct: null,
  leadTimeH: { p50: null, p85: null },
  codingH: null,
  pickupH: null,
  reviewH: null,
  mergeToProdH: null,
  recoveryH: null,
};

const PRACTICE = {
  period: '2026-Q1',
  prs: 30,
  sizeP50: 120,
  pctOver400: 0.1,
  pickupP50H: 2,
  firstReviewToMergeP50H: 5,
  humanReviewsPerPr: 1.2,
  pctMergedWithoutHumanApproval: 0.05,
};

const SYSTEM = {
  window: { from: '2025-10-26T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' },
  repos: [REPO_ACTIVE, REPO_IDLE],
  practice: {
    byQuarter: [PRACTICE],
    byMonth: [{ ...PRACTICE, period: '2026-03', prs: 11 }],
  },
  flow: {
    tickets: 20,
    cycleKanbanH: 120,
    cycleKanbanP85H: 240,
    engineeringH: 48,
    waitingH: 72,
    pctWithWait: 0.5,
    flowEfficiency: 0.4,
    states: [{ status: 'En curso', p50H: 48, pctOfTickets: 1 }],
    reworkPct: 0.1,
    closedBeforeDeliveredPct: 0.2,
  },
  batches: {
    days: [
      { date: '2026-03-01', closed: 1, closedAll: 2, viaQaNegocio: 0 },
      { date: '2026-03-02', closed: 6, closedAll: 9, viaQaNegocio: 4 },
    ],
    batches: [{ date: '2026-03-02', closed: 6, closedAll: 9, viaQaNegocio: 4 }],
    weekdayHistogram: [0, 3, 2, 5, 1, 6, 0],
    hourHistogram: Array.from({ length: 24 }, (_, h) => (h === 12 ? 7 : 0)),
  },
  definitions: { deploys: 'Runs del workflow de despliegue con éxito.' },
};

function stubSystem() {
  const fn = vi.fn(
    async () => new Response(JSON.stringify(SYSTEM), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

describe('System', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the five sections with data from /api/system', async () => {
    const fn = stubSystem();
    render(<System />);

    expect((await screen.findAllByText('org/app')).length).toBeGreaterThan(0);
    for (const title of ['DORA por repo', 'Flujo del ticket a producción', 'Práctica de PR', 'Lotes de cierre', 'Definiciones']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    expect(screen.getByText('Tiempo de ingeniería')).toBeTruthy();
    expect(screen.getAllByText('5.0 d').length).toBe(2); // cycle p50 in days: summary + flow
    expect(screen.getByText(/p85 10\.0 d · 20 tickets/)).toBeTruthy();
    expect(screen.getByText(/6 contados · 9 en total/)).toBeTruthy();
    expect(String((fn.mock.calls[0] as unknown[])[0])).toContain('/api/system?months=12&repo=all');
  });

  it('wraps the page in <main> so it gets the shared padding and max width', async () => {
    stubSystem();
    const { container } = render(<System />);
    await screen.findAllByText('org/app');
    expect(container.querySelector('main')).toBeTruthy();
  });

  it('shows a summary strip with total deploys, deploys/week and rework', async () => {
    stubSystem();
    render(<System />);
    const summary = await screen.findByLabelText('Resumen');
    expect(within(summary).getByText('12')).toBeTruthy(); // deploys across repos
    expect(within(summary).getByText('0.3')).toBeTruthy(); // 0.25/week rounded
    expect(within(summary).getByText('10%')).toBeTruthy(); // reworkPct
    expect(within(summary).getByText('Retrabajo')).toBeTruthy();
  });

  it('adds lead time p85, coding time and MTTR columns to DORA', async () => {
    stubSystem();
    render(<System />);
    await screen.findAllByText('org/app');
    for (const h of ['Lead time p85 (d)', 'Coding h', 'MTTR h']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeTruthy();
    }
    expect(screen.getByText('4.0')).toBeTruthy(); // lead p85 96h → 4.0 d
    expect(screen.getByText('30.0')).toBeTruthy(); // recoveryH
  });

  it('hides repos without deploys by default and can show them', async () => {
    stubSystem();
    render(<System />);
    await screen.findAllByText('org/app');
    expect(screen.queryByRole('cell', { name: 'org/idle' })).toBeNull();
    fireEvent.click(screen.getByLabelText(/Mostrar repos sin despliegues/));
    expect(screen.getByRole('cell', { name: 'org/idle' })).toBeTruthy();
  });

  it('switches PR practice between quarter and month', async () => {
    stubSystem();
    render(<System />);
    await screen.findByText('2026-Q1');
    fireEvent.click(screen.getByRole('button', { name: 'Por mes' }));
    expect(screen.getByText('2026-03')).toBeTruthy();
    expect(screen.queryByText('2026-Q1')).toBeNull();
  });

  it('charts closures per day, per weekday and per hour', async () => {
    stubSystem();
    render(<System />);
    await screen.findAllByText('org/app');
    expect(screen.getByRole('img', { name: /Cierres diarios/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Cierres por día de la semana/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Cierres por hora/ })).toBeTruthy();
    expect(screen.getByTitle('12h: 7')).toBeTruthy();
  });
});
