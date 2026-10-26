import { describe, it, expect } from 'vitest';
import { doraPerRepo, quantile } from '../../../src/domain/metrics/system.js';
import { at, pr, run } from '../../fixtures/system/system.js';

const settings = { deployWorkflow: 'Deploy', deployBranches: '^(main|hotfix/.*)$', featureBase: 'main' };
const window = { from: at(0), to: at(28 * 24) };

describe('quantile', () => {
  it('p50 and p85 of a small set', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([10, 20], 0.5)).toBe(15);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe('doraPerRepo', () => {
  it('4 success deploys in 28 days → 1.0/week; 1 failure in 5 → cfr 0.2; recovery 2h', () => {
    const runs = [
      run({ createdAt: at(24) }),
      run({ createdAt: at(7 * 24) }),
      run({ createdAt: at(14 * 24), conclusion: 'failure' }),
      run({ createdAt: at(14 * 24 + 2) }),
      run({ createdAt: at(21 * 24), headBranch: 'hotfix/x' }),
      run({ createdAt: at(22 * 24), headBranch: 'feature/no' }), // not a deploy branch
      run({ createdAt: at(23 * 24), name: 'CI' }), // not deploy workflow
    ];
    const [r] = doraPerRepo([], runs, settings, window);
    expect(r.repo).toBe('org/app');
    expect(r.deploys).toBe(4);
    expect(r.deploysPerWeek).toBeCloseTo(1.0);
    expect(r.cfr).toBeCloseTo(0.2);
    expect(r.hotfixPct).toBeCloseTo(0.25);
    expect(r.recoveryH).toBe(2);
  });

  it('lead time breakdown: coding 24, pickup 6, review 10, mergeToProd 24, lead 64', () => {
    const p = pr({
      firstCommitAt: at(0),
      createdAt: at(24),
      mergedAt: at(40),
      reviews: [
        { author: 'bot', isBot: true, state: 'COMMENTED', submittedAt: at(25) },
        { author: 'bob', isBot: false, state: 'APPROVED', submittedAt: at(30) },
      ],
    });
    const bot = pr({ createdAt: at(1), mergedAt: at(2), isBot: true, firstCommitAt: at(0) });
    const noDeploy = pr({ createdAt: at(70), mergedAt: at(80), firstCommitAt: at(60) });
    const runs = [run({ createdAt: at(64) })];
    const [r] = doraPerRepo([p, bot, noDeploy], runs, settings, window);
    expect(r.codingH).toBe(24);
    expect(r.pickupH).toBe(6);
    expect(r.reviewH).toBe(10);
    expect(r.mergeToProdH).toBe(24);
    expect(r.leadTimeH.p50).toBe(64);
    expect(r.leadTimeH.p85).toBe(64);
  });
});
