/**
 * Parseo puro de un issue crudo del tablero de soporte a una fila de `support_tickets`.
 * Sin alias de estado: es un backup, se guardan los nombres tal cual los devuelve Jira.
 */
import type { JiraRawIssue } from '../jira/types.js';
import type { SupportTicketRow, SupportStatusChange } from './repo.js';

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function priorityName(priority: unknown): string | null {
  if (priority && typeof priority === 'object' && 'name' in priority) {
    const name = (priority as { name?: unknown }).name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}

export function parseSupportTicket(raw: JiraRawIssue, project: string): SupportTicketRow {
  const f = raw.fields;
  const createdAt = new Date(f.created);

  const linkedKeys: string[] = [];
  for (const link of f.issuelinks ?? []) {
    const key = link.outwardIssue?.key ?? link.inwardIssue?.key;
    if (key && !linkedKeys.includes(key)) linkedKeys.push(key);
  }

  const statusChanges: SupportStatusChange[] = (raw.changelog?.histories ?? [])
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === 'status' && i.toString !== null)
        .map((i) => ({ at: new Date(h.created), from: i.fromString, to: i.toString as string })),
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((c) => ({ at: c.at.toISOString(), from: c.from, to: c.to }));

  return {
    key: raw.key,
    project,
    summary: f.summary,
    type: f.issuetype?.name ?? '',
    status: f.status?.name ?? '',
    priority: priorityName(f.priority),
    labels: f.labels ?? [],
    assigneeRaw: f.assignee?.displayName ?? null,
    reporterRaw: f.reporter?.displayName ?? null,
    createdAt,
    resolvedAt: toDate(f.resolutiondate),
    updatedAt: toDate(f.updated) ?? createdAt,
    linkedKeys,
    statusChanges,
    raw: { key: raw.key, fields: raw.fields, changelog: raw.changelog },
  };
}
