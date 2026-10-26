import { describe, it, expect } from 'vitest';
import { closureBatches, systemSummary } from '../../../src/domain/metrics/system.js';
import type { SystemResponse } from '@devboard/shared';
import { at, issue, seg } from '../../fixtures/system/system.js';

const window = { from: at(0), to: at(24 * 30) };

describe('closureBatches', () => {
  it('3 days with 6 closures each → 3 batches; histograms', () => {
    const issues = [];
    for (const day of [1, 3, 5]) {
      for (let k = 0; k < 6; k += 1) {
        issues.push(issue({ key: `B-${day}-${k}`, resolvedAt: at(day * 24 + 10), segments: k < 2 ? [seg('QA Negocio', 0, 1)] : [] }));
      }
    }
    issues.push(issue({ key: 'B-lonely', resolvedAt: at(2 * 24 + 15) }));
    const b = closureBatches(issues, window);
    expect(b.days.length).toBe(4);
    expect(b.batches.map((d) => d.closed)).toEqual([6, 6, 6]);
    expect(b.batches[0]).toEqual({ date: '2026-01-06', closed: 6, viaQaNegocio: 2 });
    expect(b.hourHistogram[10]).toBe(18);
    expect(b.hourHistogram[15]).toBe(1);
    expect(b.weekdayHistogram.reduce((a, c) => a + c, 0)).toBe(19);
    expect(b.weekdayHistogram[2]).toBe(6); // 2026-01-06 is a Tuesday
  });
});

describe('systemSummary', () => {
  it('composes the SystemResponse DTO with Spanish definitions', () => {
    const settings = { deployWorkflow: 'Deploy', deployBranches: '^main$', featureBase: 'main' };
    const res: SystemResponse = systemSummary({ prs: [], runs: [], issues: [], settings }, window);
    expect(res.repos).toEqual([]);
    expect(res.practice.byQuarter).toEqual([]);
    expect(res.flow.tickets).toBe(0);
    expect(res.batches.batches).toEqual([]);
    expect(res.definitions.flowEfficiency).toMatch(/ingeniería/);
    expect(res.window.from).toBe(at(0).toISOString());
  });
});
