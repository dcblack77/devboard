// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { System } from '../src/pages/System';

const SYSTEM = {
  window: { from: '2025-10-26T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' },
  repos: [
    {
      repo: 'org/app',
      deploys: 12,
      deploysPerWeek: 0.25,
      cfr: 0.1,
      hotfixPct: 0,
      leadTimeH: { p50: 48, p85: 96 },
      codingH: 4,
      pickupH: 2,
      reviewH: 6,
      mergeToProdH: 1,
      recoveryH: null,
    },
  ],
  practice: {
    byQuarter: [
      {
        period: '2026-Q1',
        prs: 30,
        sizeP50: 120,
        pctOver400: 0.1,
        pickupP50H: 2,
        firstReviewToMergeP50H: 5,
        humanReviewsPerPr: 1.2,
        pctMergedWithoutHumanApproval: 0.05,
      },
    ],
    byMonth: [],
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
    days: [],
    batches: [{ date: '2026-03-02', closed: 6, closedAll: 9, viaQaNegocio: 4 }],
    weekdayHistogram: [0, 3, 2, 5, 1, 6, 0],
    hourHistogram: [],
  },
  definitions: { deploys: 'Runs del workflow de despliegue con éxito.' },
};

describe('System', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the five sections with data from /api/system', async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify(SYSTEM), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fn as unknown as typeof fetch);

    render(<System />);

    expect((await screen.findAllByText('org/app')).length).toBeGreaterThan(0);
    for (const title of ['DORA por repo', 'Flujo del ticket a producción', 'Práctica de PR por trimestre', 'Lotes de cierre', 'Definiciones']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    expect(screen.getByText('Tiempo de ingeniería')).toBeTruthy();
    expect(screen.getByText('5.0 d')).toBeTruthy(); // cycle p50 in days
    expect(screen.getByText(/p85 10\.0 d · 20 tickets/)).toBeTruthy();
    expect(screen.getByText(/6 cierres contados · 9 en total/)).toBeTruthy();
    expect(String((fn.mock.calls[0] as unknown[])[0])).toContain('/api/system?months=12&repo=all');
  });
});
