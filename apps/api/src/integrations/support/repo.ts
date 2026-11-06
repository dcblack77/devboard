/**
 * Persistencia del backup del tablero de soporte (`support_tickets`). Implementación real
 * en `repo.drizzle.ts`; en tests se sustituye por un fake en memoria.
 */

export interface SupportStatusChange {
  /** Instante ISO del cambio. */
  at: string;
  from: string | null;
  to: string;
}

export interface SupportTicketRow {
  key: string;
  project: string;
  summary: string;
  type: string;
  status: string;
  priority: string | null;
  labels: string[];
  assigneeRaw: string | null;
  reporterRaw: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  updatedAt: Date;
  linkedKeys: string[];
  statusChanges: SupportStatusChange[];
  raw: unknown;
}

export interface SupportRepo {
  /** Inserta o actualiza (por `key`) todas las columnas de cada ticket. */
  upsertTickets(rows: SupportTicketRow[]): Promise<void>;
  /** Número de tickets guardados de un proyecto (0 ⇒ toca carga completa). */
  countByProject(project: string): Promise<number>;
}
