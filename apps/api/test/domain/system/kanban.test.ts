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
    expect(f.pctWithWait).toBe(1);
    expect(f.flowEfficiency).toBeCloseTo(0.3);
    expect(f.cycleKanbanH).toBe(240);
    expect(f.cycleKanbanP85H).toBe(240);
    expect(f.reworkPct).toBe(0);
    expect(f.closedBeforeDeliveredPct).toBe(0);
  });

  it('cycle ends at Finalizada (resolvedAt), not at deliveredAt', () => {
    const i = issue({
      key: 'X-5',
      resolvedAt: at(240),
      deliveredAt: at(72),
      segments: [
        seg('En curso', 0, 48),
        seg('In review', 48, 72),
        seg('Desplegado en DEV', 72, 144),
        seg('QA Negocio', 144, 240),
        seg('Finalizada', 240, 300),
      ],
    });
    const f = kanbanCycle([i], window);
    expect(f.cycleKanbanH).toBe(240);
    expect(f.closedBeforeDeliveredPct).toBe(0);
  });

  it('waitingH is the median over tickets that waited; flow efficiency stays total-based', () => {
    const waited = issue({ key: 'W-1', resolvedAt: at(40), segments: [seg('En curso', 0, 20), seg('Blocked', 20, 40)] });
    const a = issue({ key: 'W-2', resolvedAt: at(10), segments: [seg('En curso', 0, 10)] });
    const b = issue({ key: 'W-3', resolvedAt: at(10), segments: [seg('En curso', 0, 10)] });
    const f = kanbanCycle([waited, a, b], window);
    expect(f.tickets).toBe(3);
    expect(f.waitingH).toBe(20);
    expect(f.pctWithWait).toBeCloseTo(1 / 3);
    expect(f.flowEfficiency).toBeCloseTo(40 / 60);
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
    expect(f.cycleKanbanH).toBe(40); // (50 + 30) / 2 — both end at resolvedAt
  });

  it('states follow statusFlow order and exclude Finalizada', () => {
    const statusFlow = ['Backlog', 'Por hacer', 'En curso', 'In review', 'Blocked', 'Desplegado en DEV', 'QA Negocio', 'Finalizada'];
    const i = issue({
      key: 'O-1',
      resolvedAt: at(100),
      segments: [seg('Por hacer', -5, 0), seg('En curso', 0, 10), seg('QA Negocio', 10, 50), seg('In review', 50, 100), seg('Finalizada', 100, 200)],
    });
    const f = kanbanCycle([i], window, { statusFlow });
    expect(f.states.map((s) => s.status)).toEqual(['Por hacer', 'En curso', 'In review', 'QA Negocio']);
  });

  it('only counted issue types enter the cycle metrics', () => {
    const story = issue({ key: 'T-1', type: 'Historia', resolvedAt: at(10), segments: [seg('En curso', 0, 10)] });
    const sub = issue({ key: 'T-2', type: 'Subtarea', resolvedAt: at(100), segments: [seg('En curso', 0, 100)] });
    const f = kanbanCycle([story, sub], window, { countedTypes: ['Historia', 'Tarea', 'Error'] });
    expect(f.tickets).toBe(1);
    expect(f.cycleKanbanH).toBe(10);
    expect(kanbanCycle([story, sub], window).tickets).toBe(2);
  });
});
