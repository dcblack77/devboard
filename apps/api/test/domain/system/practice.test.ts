import { describe, it, expect } from 'vitest';
import { prPractice } from '../../../src/domain/metrics/system.js';
import { at, pr } from '../../fixtures/system/system.js';

const settings = { deployWorkflow: 'Deploy', deployBranches: '^main$', featureBase: 'main' };
const window = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-06-30T00:00:00Z') };
const approve = (h: number) => ({ author: 'bob', isBot: false, state: 'APPROVED', submittedAt: at(h) });

describe('prPractice', () => {
  it('groups feature PRs by quarter and month with hand-checkable medians', () => {
    const prs = [
      pr({ createdAt: at(0), mergedAt: at(10), additions: 100, deletions: 0, reviews: [approve(2)] }), // Jan, Q1
      pr({ createdAt: at(0), mergedAt: at(20), additions: 500, deletions: 0, reviews: [approve(4), approve(6)] }), // Jan
      pr({ createdAt: at(0), mergedAt: at(24 * 40), additions: 50, deletions: 0, baseRef: null }), // Feb, no approval
      pr({ createdAt: at(0), mergedAt: at(24 * 100), additions: 1, deletions: 1 }), // Apr, Q2
      pr({ createdAt: at(0), mergedAt: at(10), baseRef: 'develop' }), // excluded
      pr({ createdAt: at(0), mergedAt: at(10), isBot: true }), // excluded
      pr({ createdAt: at(0), mergedAt: null }), // excluded
    ];
    const { byQuarter, byMonth } = prPractice(prs, settings, window);
    expect(byQuarter.map((q) => q.period)).toEqual(['2026-Q1', '2026-Q2']);
    expect(byMonth.map((m) => m.period)).toEqual(['2026-01', '2026-02', '2026-04']);
    const jan = byMonth[0];
    expect(jan.prs).toBe(2);
    expect(jan.sizeP50).toBe(300);
    expect(jan.pctOver400).toBe(0.5);
    expect(jan.pickupP50H).toBe(3); // (2 + 4) / 2
    expect(jan.firstReviewToMergeP50H).toBe(12); // (8 + 16) / 2
    expect(jan.humanReviewsPerPr).toBe(1.5);
    expect(jan.pctMergedWithoutHumanApproval).toBe(0);
    const q1 = byQuarter[0];
    expect(q1.prs).toBe(3);
    expect(q1.pctMergedWithoutHumanApproval).toBeCloseTo(1 / 3);
  });
});
