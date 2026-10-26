import { describe, it, expect } from 'vitest';
import { toPullRequest, DEFAULT_HOTFIX_REGEX } from '../../../src/integrations/github/parse.js';
import prMerged from './fixtures/pr-merged.json' with { type: 'json' };
import prDraftHotfix from './fixtures/pr-draft-hotfix.json' with { type: 'json' };
import prSelfMerged from './fixtures/pr-self-merged.json' with { type: 'json' };
import type { PrNode } from '../../../src/integrations/github/types.js';

const issueKeyRegex = /\bPROJ-\d+\b/gi;

describe('toPullRequest', () => {
  it('parsea PR mergeada: readyAt = último ReadyForReviewEvent, excluye autor/bots/PENDING de reviews', () => {
    const pr = toPullRequest(prMerged as PrNode, { issueKeyRegex });

    expect(pr.id).toBe('svc-a#101');
    expect(pr.repo).toBe('svc-a');
    expect(pr.number).toBe(101);
    expect(pr.state).toBe('merged');
    expect(pr.authorLogin).toBe('user1');
    expect(pr.mergedByLogin).toBe('user2');
    // ready_at: ReadyForReviewEvent a las 12:00 (> created 09:00)
    expect(pr.readyAt.toISOString()).toBe('2025-01-05T12:00:00.000Z');
    // reviews: excluye al autor (user1), a dependabot, y a la PENDING sin submittedAt
    expect(pr.reviews).toHaveLength(1);
    expect(pr.reviews[0]).toMatchObject({ reviewerLogin: 'user2', state: 'APPROVED' });
    expect(pr.issueKeys).toEqual(['PROJ-123']);
    expect(pr.hotfix).toBe(false);
    expect(pr.reviewRequests).toHaveLength(1);
    expect(pr.reviewRequests[0].requestedLogin).toBe('user2');
  });

  it('baseRef y firstCommitAt: rama base + la menor de authoredDate/committedDate del primer commit', () => {
    const pr = toPullRequest(prMerged as PrNode);
    expect(pr.baseRef).toBe('develop');
    expect(pr.firstCommitAt?.toISOString()).toBe('2025-01-03T08:00:00.000Z');
  });

  it('firstCommitAt usa committedDate si es anterior a authoredDate', () => {
    const node: PrNode = {
      ...(prMerged as PrNode),
      commits: { nodes: [{ commit: { authoredDate: '2025-01-04T09:30:00Z', committedDate: '2025-01-02T07:00:00Z' } }] },
    };
    expect(toPullRequest(node).firstCommitAt?.toISOString()).toBe('2025-01-02T07:00:00.000Z');
  });

  it('sin commits ni baseRefName (fixture antigua): firstCommitAt y baseRef null', () => {
    const pr = toPullRequest(prDraftHotfix as PrNode);
    expect(pr.firstCommitAt).toBeNull();
    expect(pr.baseRef).toBeNull();
    const empty: PrNode = { ...(prMerged as PrNode), commits: { nodes: [] }, baseRefName: null };
    expect(toPullRequest(empty).firstCommitAt).toBeNull();
    expect(toPullRequest(empty).baseRef).toBeNull();
  });

  it('sin timelineItems: readyAt = createdAt', () => {
    const pr = toPullRequest(prDraftHotfix as PrNode);
    expect(pr.readyAt.toISOString()).toBe(pr.createdAt.toISOString());
    expect(pr.state).toBe('open');
    expect(pr.isDraft).toBe(true);
  });

  it('detecta hotfix por regex en título o rama', () => {
    const pr = toPullRequest(prDraftHotfix as PrNode, { hotfixRegex: DEFAULT_HOTFIX_REGEX });
    expect(pr.hotfix).toBe(true);
  });

  it('self-merge sin reviews: reviews vacío, no hay approvals que contar (self_merged_no_approval calculable aguas arriba)', () => {
    const pr = toPullRequest(prSelfMerged as PrNode, { issueKeyRegex });
    expect(pr.state).toBe('merged');
    expect(pr.mergedByLogin).toBe('user1');
    expect(pr.authorLogin).toBe('user1');
    expect(pr.reviews).toEqual([]);
    expect(pr.issueKeys).toEqual(['PROJ-77']);
  });

  it('issueKeys: únicos y en mayúsculas, sobre título + rama', () => {
    const node: PrNode = {
      ...(prMerged as PrNode),
      title: 'proj-123 fix and proj-123 again',
      headRefName: 'feature/PROJ-999-branch',
    };
    const pr = toPullRequest(node, { issueKeyRegex });
    expect(pr.issueKeys).toEqual(['PROJ-123', 'PROJ-999']);
  });

  it('sin issueKeyRegex: issueKeys vacío', () => {
    const pr = toPullRequest(prMerged as PrNode);
    expect(pr.issueKeys).toEqual([]);
  });

  it('botPatterns configurable: excluye reviewer que matchee patrón adicional', () => {
    const node: PrNode = {
      ...(prMerged as PrNode),
      reviews: {
        nodes: [
          { author: { login: 'custom-bot' }, state: 'APPROVED', submittedAt: '2025-01-06T10:00:00Z' },
          { author: { login: 'user2' }, state: 'APPROVED', submittedAt: '2025-01-06T11:00:00Z' },
        ],
      },
    };
    const pr = toPullRequest(node, { botPatterns: ['custom-bot'] });
    expect(pr.reviews).toHaveLength(1);
    expect(pr.reviews[0].reviewerLogin).toBe('user2');
  });
});
