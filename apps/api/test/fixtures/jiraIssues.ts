/**
 * Fixtures sintéticos de filas `issues` / `issue_status_segments` para los
 * tests de métricas. Datos ficticios (proyecto "PROJ", personas "Ana Pérez"
 * / "Luis Gómez"), sin relación con ningún equipo real.
 */
import type { issues, issueStatusSegments } from '../../src/db/schema.js';

type IssueRow = typeof issues.$inferSelect;
type SegmentRow = typeof issueStatusSegments.$inferSelect;

let segId = 1;

export function makeIssue(overrides: Partial<IssueRow> & { key: string }): IssueRow {
  return {
    key: overrides.key,
    summary: overrides.summary ?? `Issue ${overrides.key}`,
    type: overrides.type ?? 'Historia',
    status: overrides.status ?? 'Por hacer',
    statusNorm: overrides.statusNorm ?? overrides.status ?? 'Por hacer',
    macro: overrides.macro ?? 'pendiente',
    assigneeRaw: overrides.assigneeRaw ?? null,
    personId: overrides.personId ?? null,
    parentKey: overrides.parentKey ?? null,
    parentType: overrides.parentType ?? null,
    epicKey: overrides.epicKey ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T09:00:00.000Z'),
    resolvedAt: overrides.resolvedAt ?? null,
    updatedAt: overrides.updatedAt ?? overrides.createdAt ?? new Date('2026-01-01T09:00:00.000Z'),
    raw: overrides.raw ?? {},
  };
}

export function makeSegment(overrides: Partial<SegmentRow> & { issueKey: string; status: string; startedAt: Date }): SegmentRow {
  return {
    id: overrides.id ?? segId++,
    issueKey: overrides.issueKey,
    status: overrides.status,
    startedAt: overrides.startedAt,
    endedAt: overrides.endedAt ?? null,
    seq: overrides.seq ?? 0,
  };
}
