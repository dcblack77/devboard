/**
 * Implementación Drizzle/Postgres de GithubRepo. Recibe una instancia de
 * NodePgDatabase ya conectada (no abre conexión propia), igual que
 * DrizzleJiraRepo.
 */
import { eq, sql } from 'drizzle-orm';

const WORKFLOW_RUNS_CHUNK = 500;
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pullRequests, prReviews, prReviewRequests, workflowRuns } from '../../db/schema.js';
import type {
  GithubRepo,
  PrUpsertInput,
  ReviewUpsertInput,
  ReviewRequestUpsertInput,
  WorkflowRunUpsertInput,
} from './repo.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = NodePgDatabase<any>;

export class DrizzleGithubRepo implements GithubRepo {
  constructor(private readonly db: AnyDb) {}

  async upsertPrs(items: PrUpsertInput[]): Promise<void> {
    for (const it of items) {
      await this.db
        .insert(pullRequests)
        .values({
          id: it.id,
          repo: it.repo,
          number: it.number,
          title: it.title,
          url: it.url,
          state: it.state,
          isDraft: it.isDraft,
          authorLogin: it.authorLogin,
          createdAt: it.createdAt,
          readyAt: it.readyAt,
          mergedAt: it.mergedAt,
          closedAt: it.closedAt,
          mergedByLogin: it.mergedByLogin,
          additions: it.additions,
          deletions: it.deletions,
          changedFiles: it.changedFiles,
          headRef: it.headRef,
          baseRef: it.baseRef,
          firstCommitAt: it.firstCommitAt,
          erfKeys: it.erfKeys,
          hotfix: it.hotfix,
          raw: it.raw as object,
        })
        .onConflictDoUpdate({
          target: pullRequests.id,
          set: {
            title: it.title,
            url: it.url,
            state: it.state,
            isDraft: it.isDraft,
            authorLogin: it.authorLogin,
            readyAt: it.readyAt,
            mergedAt: it.mergedAt,
            closedAt: it.closedAt,
            mergedByLogin: it.mergedByLogin,
            additions: it.additions,
            deletions: it.deletions,
            changedFiles: it.changedFiles,
            headRef: it.headRef,
            baseRef: it.baseRef,
            firstCommitAt: it.firstCommitAt,
            erfKeys: it.erfKeys,
            hotfix: it.hotfix,
            raw: it.raw as object,
          },
        });
    }
  }

  async replaceReviews(prId: string, reviews: ReviewUpsertInput[]): Promise<void> {
    await this.db.delete(prReviews).where(eq(prReviews.prId, prId));
    if (reviews.length === 0) return;
    await this.db.insert(prReviews).values(
      reviews.map((r) => ({
        prId,
        reviewerLogin: r.reviewerLogin,
        state: r.state,
        submittedAt: r.submittedAt,
        isBot: r.isBot,
      })),
    );
  }

  async replaceRequests(prId: string, requests: ReviewRequestUpsertInput[]): Promise<void> {
    await this.db.delete(prReviewRequests).where(eq(prReviewRequests.prId, prId));
    if (requests.length === 0) return;
    await this.db.insert(prReviewRequests).values(
      requests.map((r) => ({ prId, at: r.at, requestedLogin: r.requestedLogin })),
    );
  }

  async upsertWorkflowRuns(rows: WorkflowRunUpsertInput[]): Promise<void> {
    // Inserción multi-fila por lotes: ~2.500 runs/año por repo hacían una
    // sentencia por fila. `excluded.<col>` toma el valor de la fila en conflicto.
    for (let i = 0; i < rows.length; i += WORKFLOW_RUNS_CHUNK) {
      const chunk = rows.slice(i, i + WORKFLOW_RUNS_CHUNK);
      await this.db
        .insert(workflowRuns)
        .values(
          chunk.map((r) => ({
            id: r.id,
            repo: r.repo,
            name: r.name,
            event: r.event,
            status: r.status,
            conclusion: r.conclusion,
            headBranch: r.headBranch,
            headSha: r.headSha,
            runAttempt: r.runAttempt,
            createdAt: r.createdAt,
            runStartedAt: r.runStartedAt,
            updatedAt: r.updatedAt,
          })),
        )
        .onConflictDoUpdate({
          target: workflowRuns.id,
          set: {
            status: sql`excluded.status`,
            conclusion: sql`excluded.conclusion`,
            runAttempt: sql`excluded.run_attempt`,
            runStartedAt: sql`excluded.run_started_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
  }
}
