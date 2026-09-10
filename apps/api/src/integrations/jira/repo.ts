/**
 * Interfaz de persistencia usada por JiraSync. Implementación real en
 * `repo.drizzle.ts`; se puede mockear en tests sin tocar Postgres.
 */
import type { ParsedIssue, EpicWithChildren } from './types.js';

export interface IssueUpsertInput {
  key: string;
  summary: string;
  type: string;
  status: string;
  statusNorm: string;
  macro: string;
  assigneeRaw: string | null;
  parentKey: string | null;
  parentType: string | null;
  epicKey: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  updatedAt: Date;
  raw: unknown;
}

export interface SegmentInput {
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  seq: number;
}

export interface AssigneeChangeInput {
  at: Date;
  toRaw: string | null;
}

export interface EpicUpsertInput {
  key: string;
  summary: string;
  status: string;
  assigneeRaw: string | null;
  createdAt: Date;
}

export interface JiraRepo {
  /** Inserta/actualiza issues (upsert por `key`). */
  upsertIssues(issues: IssueUpsertInput[]): Promise<void>;
  /** Borra y reinserta los segmentos de un issue (recalculados cada sync). */
  replaceSegments(issueKey: string, segments: SegmentInput[]): Promise<void>;
  /** Reemplaza el historial de cambios de asignado de un issue. */
  replaceAssigneeChanges(issueKey: string, changes: AssigneeChangeInput[]): Promise<void>;
  /** Inserta/actualiza épicas (upsert por `key`). */
  upsertEpics(epics: EpicUpsertInput[]): Promise<void>;
}

/** Adapta un ParsedIssue + contexto (epicKey, macro) al shape que espera el repo. */
export function toIssueUpsertInput(
  parsed: ParsedIssue,
  extra: { statusNorm: string; macro: string; epicKey: string | null },
): IssueUpsertInput {
  return {
    key: parsed.key,
    summary: parsed.summary,
    type: parsed.type,
    status: parsed.statusRaw,
    statusNorm: extra.statusNorm,
    macro: extra.macro,
    assigneeRaw: parsed.assigneeRaw,
    parentKey: parsed.parentKey,
    parentType: parsed.parentType,
    epicKey: extra.epicKey,
    createdAt: parsed.createdAt,
    resolvedAt: parsed.resolvedAt,
    updatedAt: parsed.updatedAt ?? parsed.createdAt,
    raw: parsed,
  };
}

export function toEpicUpsertInput(epic: EpicWithChildren): EpicUpsertInput {
  return {
    key: epic.key,
    summary: epic.summary,
    status: epic.status,
    assigneeRaw: epic.assigneeRaw,
    createdAt: epic.createdAt ?? new Date(0),
  };
}
