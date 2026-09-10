/**
 * Implementación Drizzle/Postgres de JiraRepo. Recibe una instancia de
 * NodePgDatabase ya conectada (no abre conexión propia) para poder reusar
 * el pool de conexión que cree el resto de la app.
 */
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  issues,
  issueStatusSegments,
  issueAssigneeChanges,
  epics,
} from '../../db/schema.js';
import type {
  JiraRepo,
  IssueUpsertInput,
  SegmentInput,
  AssigneeChangeInput,
  EpicUpsertInput,
} from './repo.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = NodePgDatabase<any>;

export class DrizzleJiraRepo implements JiraRepo {
  constructor(private readonly db: AnyDb) {}

  async upsertIssues(items: IssueUpsertInput[]): Promise<void> {
    for (const it of items) {
      await this.db
        .insert(issues)
        .values({
          key: it.key,
          summary: it.summary,
          type: it.type,
          status: it.status,
          statusNorm: it.statusNorm,
          macro: it.macro,
          assigneeRaw: it.assigneeRaw,
          parentKey: it.parentKey,
          parentType: it.parentType,
          epicKey: it.epicKey,
          createdAt: it.createdAt,
          resolvedAt: it.resolvedAt,
          updatedAt: it.updatedAt,
          raw: it.raw as object,
        })
        .onConflictDoUpdate({
          target: issues.key,
          set: {
            summary: it.summary,
            type: it.type,
            status: it.status,
            statusNorm: it.statusNorm,
            macro: it.macro,
            assigneeRaw: it.assigneeRaw,
            parentKey: it.parentKey,
            parentType: it.parentType,
            epicKey: it.epicKey,
            resolvedAt: it.resolvedAt,
            updatedAt: it.updatedAt,
            raw: it.raw as object,
          },
        });
    }
  }

  async replaceSegments(issueKey: string, segments: SegmentInput[]): Promise<void> {
    await this.db.delete(issueStatusSegments).where(eq(issueStatusSegments.issueKey, issueKey));
    if (segments.length === 0) return;
    await this.db.insert(issueStatusSegments).values(
      segments.map((s) => ({
        issueKey,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        seq: s.seq,
      })),
    );
  }

  async replaceAssigneeChanges(issueKey: string, changes: AssigneeChangeInput[]): Promise<void> {
    await this.db.delete(issueAssigneeChanges).where(eq(issueAssigneeChanges.issueKey, issueKey));
    if (changes.length === 0) return;
    await this.db.insert(issueAssigneeChanges).values(
      changes.map((c) => ({ issueKey, at: c.at, toRaw: c.toRaw })),
    );
  }

  async upsertEpics(items: EpicUpsertInput[]): Promise<void> {
    for (const it of items) {
      await this.db
        .insert(epics)
        .values({
          key: it.key,
          summary: it.summary,
          status: it.status,
          assigneeRaw: it.assigneeRaw,
          createdAt: it.createdAt,
        })
        .onConflictDoUpdate({
          target: epics.key,
          set: {
            summary: it.summary,
            status: it.status,
            assigneeRaw: it.assigneeRaw,
          },
        });
    }
  }
}
