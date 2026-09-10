/**
 * Parser puro de issues Jira crudos (con changelog) → segments de estado,
 * status_changes y assignee_changes. Misma lógica que team_board.py::analyze():
 * - estado inicial = `from` del primer cambio de estado, o el estado actual si no hay cambios.
 * - el último segmento queda abierto (endedAt = null) salvo que el estado actual
 *   sea el "estado final" configurado (p.ej. "Finalizada"/"Done").
 * - normalización de nombres de estado vía un mapa de alias recibido por parámetro.
 */
import type { JiraRawIssue, ParsedIssue, StatusAliasMap, StatusChange, AssigneeChange, StatusSegment } from './types.js';

/** Normaliza un nombre de estado crudo usando el alias map (identidad si no hay alias). */
export function normalizeStatus(raw: string | null | undefined, aliases: StatusAliasMap): string {
  if (!raw) return raw as unknown as string;
  return aliases[raw] ?? raw;
}

export interface ParseOptions {
  /** Mapa de alias de estado (nombre crudo → nombre normalizado). */
  aliases: StatusAliasMap;
  /** Estado final normalizado (p.ej. "Finalizada"); si el último segmento tiene este estado, se cierra en resolvedAt/updatedAt en vez de quedar abierto. */
  finalStatus: string;
  /** Instante "ahora" para cerrar el segmento abierto (por defecto: new Date()). */
  now?: Date;
}

/**
 * Parsea un issue crudo de Jira (con `fields` y `changelog.histories`) a la
 * forma normalizada usada por el resto del sistema.
 */
export function parseIssue(issue: JiraRawIssue, opts: ParseOptions): ParsedIssue {
  const { aliases, finalStatus } = opts;
  const now = opts.now ?? new Date();
  const f = issue.fields;
  const createdAt = new Date(f.created);

  const histories = [...(issue.changelog?.histories ?? [])].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
  );

  const statusChanges: StatusChange[] = [];
  const assigneeChanges: AssigneeChange[] = [];
  for (const h of histories) {
    const at = new Date(h.created);
    for (const item of h.items) {
      if (item.field === 'status') {
        statusChanges.push({
          at,
          from: item.fromString ? normalizeStatus(item.fromString, aliases) : null,
          to: normalizeStatus(item.toString ?? '', aliases),
        });
      } else if (item.field === 'assignee') {
        assigneeChanges.push({ at, to: item.toString ?? null });
      }
    }
  }

  const currentStatus = normalizeStatus(f.status.name, aliases);
  const firstStatus = statusChanges.length > 0 ? statusChanges[0].from ?? currentStatus : currentStatus;

  const segments: StatusSegment[] = [];
  let cur = firstStatus;
  let start = createdAt;
  let seq = 0;
  for (const change of statusChanges) {
    segments.push({ status: cur, startedAt: start, endedAt: change.at, seq });
    seq += 1;
    cur = change.to;
    start = change.at;
  }
  // último segmento: abierto salvo que el estado actual sea el final configurado
  const isFinal = cur === finalStatus;
  const resolvedAt = f.resolutiondate ? new Date(f.resolutiondate) : null;
  const endedAt = isFinal ? resolvedAt ?? now : null;
  segments.push({ status: cur, startedAt: start, endedAt, seq });

  const parent = f.parent ?? null;

  return {
    key: issue.key,
    summary: f.summary,
    type: f.issuetype.name,
    statusRaw: f.status.name,
    assigneeRaw: f.assignee?.displayName ?? null,
    parentKey: parent?.key ?? null,
    parentType: parent?.fields?.issuetype?.name ?? null,
    createdAt,
    resolvedAt,
    updatedAt: f.updated ? new Date(f.updated) : null,
    statusChanges,
    assigneeChanges,
    segments,
  };
}

/** Parsea un lote de issues crudos. */
export function parseIssues(issues: JiraRawIssue[], opts: ParseOptions): ParsedIssue[] {
  return issues.map((issue) => parseIssue(issue, opts));
}
