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
  dueDate: string | null;
  storyPoints: number | null;
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
  startDate: string | null;
  dueDate: string | null;
  resolvedAt: Date | null;
}

export interface InitiativeRow {
  id: number;
  name: string;
  slug: string;
  source: string;
  epicKey: string | null;
}

export interface InitiativeEpicRow {
  initiativeId: number;
  epicKey: string;
}

export interface AutoInitiativeInput {
  name: string;
  slug: string;
  epicKey: string;
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
  /** Solo UPDATE (sin insert) de fin y puntos de issues existentes, por key: backfill de hijos de épica. */
  updateIssueEstimates(items: Array<{ key: string; dueDate: string | null; storyPoints: number | null }>): Promise<void>;
  /** Todas las iniciativas + sus filas de `initiative_epics` (para la reconciliación auto). */
  listInitiativesWithEpics(): Promise<{ initiatives: InitiativeRow[]; initiativeEpics: InitiativeEpicRow[] }>;
  /** Crea una iniciativa `source='auto'` y su fila en `initiative_epics`, en una transacción. */
  createAutoInitiative(input: AutoInitiativeInput): Promise<number>;
  /** Cambia el nombre de una iniciativa (usado para seguir el summary de la épica). */
  renameInitiative(id: number, name: string): Promise<void>;
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
    dueDate: parsed.dueDate ?? null,
    storyPoints: parsed.storyPoints ?? null,
  };
}

export function toEpicUpsertInput(epic: EpicWithChildren): EpicUpsertInput {
  return {
    key: epic.key,
    summary: epic.summary,
    status: epic.status,
    assigneeRaw: epic.assigneeRaw,
    createdAt: epic.createdAt ?? new Date(0),
    startDate: epic.startDate ?? null,
    dueDate: epic.dueDate ?? null,
    resolvedAt: epic.resolvedAt ?? null,
  };
}
