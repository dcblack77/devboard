import { describe, it, expect, vi } from 'vitest';
import { DrizzleGithubRepo } from '../../../src/integrations/github/repo.drizzle.js';
import type { WorkflowRunUpsertInput } from '../../../src/integrations/github/repo.js';

function fakeDb() {
  const calls: unknown[][] = [];
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const values = vi.fn((rows: unknown[]) => {
    calls.push(rows);
    return { onConflictDoUpdate };
  });
  const insert = vi.fn(() => ({ values }));
  return { db: { insert } as never, insert, calls, onConflictDoUpdate };
}

function run(i: number): WorkflowRunUpsertInput {
  return {
    id: i,
    repo: 'r',
    name: 'Deploy',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    headBranch: 'main',
    headSha: 'abc',
    runAttempt: 1,
    createdAt: new Date(),
    runStartedAt: null,
    updatedAt: null,
  };
}

describe('DrizzleGithubRepo.upsertWorkflowRuns', () => {
  it('chunks 1200 rows into 3 multi-row inserts of <=500', async () => {
    const f = fakeDb();
    const repo = new DrizzleGithubRepo(f.db);
    await repo.upsertWorkflowRuns(Array.from({ length: 1200 }, (_, i) => run(i)));
    expect(f.insert).toHaveBeenCalledTimes(3);
    expect(f.calls.map((c) => c.length)).toEqual([500, 500, 200]);
    expect(f.onConflictDoUpdate).toHaveBeenCalledTimes(3);
  });

  it('does nothing for empty input', async () => {
    const f = fakeDb();
    await new DrizzleGithubRepo(f.db).upsertWorkflowRuns([]);
    expect(f.insert).not.toHaveBeenCalled();
  });
});
