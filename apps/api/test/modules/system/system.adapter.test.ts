import { describe, it, expect } from 'vitest';
import { normalizeSegments, toSystemIssues } from '../../../src/modules/system/system.adapter.js';
import { kanbanCycle } from '../../../src/domain/metrics/system.js';
import type { AnalyzedIssue } from '../../../src/domain/metrics/issues.js';

const T0 = new Date('2026-01-05T00:00:00Z');
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);
const ALIASES = { 'In Progress': 'En curso', 'IN REVIEW': 'In review', Done: 'Finalizada', BLOCKED: 'Blocked' };

describe('system.adapter normalization', () => {
  it('applies statusAliases and merges adjacent segments with the same normalized status', () => {
    const out = normalizeSegments(
      [
        { status: 'In Progress', startedAt: at(0), endedAt: at(24) },
        { status: 'En curso', startedAt: at(24), endedAt: at(48) },
        { status: 'IN REVIEW', startedAt: at(48), endedAt: at(60) },
      ],
      ALIASES,
    );
    expect(out).toEqual([
      { status: 'En curso', startedAt: at(0), endedAt: at(48) },
      { status: 'In review', startedAt: at(48), endedAt: at(60) },
    ]);
  });

  it('raw "In Progress" 24h + "En curso" 24h → engineeringH 48', () => {
    const row = {
      key: 'ERF-1',
      created: at(-24),
      resolved: at(60),
      deliveredAt: null,
      segments: [
        { status: 'In Progress', startedAt: at(0), endedAt: at(24) },
        { status: 'En curso', startedAt: at(24), endedAt: at(48) },
      ],
    } as unknown as AnalyzedIssue;
    const issues = toSystemIssues([row], ALIASES);
    const flow = kanbanCycle(issues, { from: at(0), to: at(24 * 30) });
    expect(flow.tickets).toBe(1);
    expect(flow.engineeringH).toBe(48);
    expect(flow.reworkPct).toBe(0);
  });
});
