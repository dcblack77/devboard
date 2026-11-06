/**
 * Lectura de `support_tickets` de un proyecto, ya convertidos a la entrada del dominio
 * (`SupportTicketInput`). Separado del controlador para poder mockearlo en tests.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { supportTickets } from '../../db/schema.js';
import type { SupportStatusChange } from '../../integrations/support/repo.js';
import type { SupportTicketInput } from '../../domain/metrics/support.js';

export async function loadSupportTickets(project: string): Promise<SupportTicketInput[]> {
  const rows = await getDb().select().from(supportTickets).where(eq(supportTickets.project, project));
  return rows.map((r) => ({
    key: r.key,
    summary: r.summary,
    type: r.type,
    status: r.status,
    priority: r.priority,
    labels: (r.labels ?? []) as string[],
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    linkedKeys: (r.linkedKeys ?? []) as string[],
    statusChanges: ((r.statusChanges ?? []) as SupportStatusChange[]).map((c) => ({
      at: new Date(c.at),
      from: c.from,
      to: c.to,
    })),
  }));
}
