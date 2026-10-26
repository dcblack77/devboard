import { describe, it, expect } from 'vitest';
import { kanbanCycle } from '../../../src/domain/metrics/system.js';
import { at, issue, seg } from '../../fixtures/system/system.js';

const window = { from: at(0), to: at(24 * 30) };

describe('kanbanCycle', () => {
  it('eng 72, waiting 168, flow 0.3, cycle = sum (240)', () => {
    const i = issue({
      key: 'X-1',
      resolvedAt: at(240),
      segments: [
        seg('Pendiente', -10, 0),
        seg('En curso', 0, 48),
        seg('In review', 48, 72),
        seg('Desplegado en DEV', 72, 144),
        seg('QA Negocio', 144, 240),
        seg('Finalizada', 240, 300),
      ],
    });
    const f = kanbanCycle([i], window);
    expect(f.tickets).toBe(1);
    expect(f.engineeringH).toBe(72);
    expect(f.waitingH).toBe(168);
    expect(f.flowEfficiency).toBeCloseTo(0.3);
    expect(f.cycleKanbanH).toBe(240);
    expect(f.reworkPct).toBe(0);
    expect(f.closedBeforeDeliveredPct).toBe(0);
  });

  it('per-state stats only over visitors; rework and closedBeforeDelivered', () => {
    const a = issue({
      key: 'X-2',
      resolvedAt: at(50),
      deliveredAt: at(60),
      segments: [seg('En curso', 0, 10), seg('Blocked', 10, 20), seg('En curso', 20, 50)],
    });
    const b = issue({ key: 'X-3', resolvedAt: at(30), segments: [seg('En curso', 0, 30)] });
    const outside = issue({ key: 'X-4', resolvedAt: at(24 * 60), segments: [seg('En curso', 0, 1)] });
    const f = kanbanCycle([a, b, outside], window);
    expect(f.tickets).toBe(2);
    expect(f.reworkPct).toBe(0.5);
    expect(f.closedBeforeDeliveredPct).toBe(0.5);
    const blocked = f.states.find((s) => s.status === 'Blocked');
    expect(blocked).toEqual({ status: 'Blocked', p50H: 10, pctOfTickets: 0.5 });
    expect(f.cycleKanbanH).toBe(45); // (60 + 30) / 2 — a ends at deliveredAt
  });
});
