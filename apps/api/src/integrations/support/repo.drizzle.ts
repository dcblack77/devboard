/**
 * Implementación Drizzle/Postgres de SupportRepo sobre `support_tickets`.
 */
import { count, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { supportTickets } from '../../db/schema.js';
import type { SupportRepo, SupportTicketRow } from './repo.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = NodePgDatabase<any>;

export class DrizzleSupportRepo implements SupportRepo {
  constructor(private readonly db: AnyDb) {}

  async upsertTickets(rows: SupportTicketRow[]): Promise<void> {
    for (const row of rows) {
      const values = {
        project: row.project,
        summary: row.summary,
        type: row.type,
        status: row.status,
        priority: row.priority,
        labels: row.labels,
        assigneeRaw: row.assigneeRaw,
        reporterRaw: row.reporterRaw,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt,
        updatedAt: row.updatedAt,
        linkedKeys: row.linkedKeys,
        statusChanges: row.statusChanges,
        raw: row.raw as object,
      };
      await this.db
        .insert(supportTickets)
        .values({ key: row.key, ...values })
        .onConflictDoUpdate({ target: supportTickets.key, set: values });
    }
  }

  async countByProject(project: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.project, project));
    return Number(row?.n ?? 0);
  }
}
