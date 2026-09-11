/**
 * Análisis puro de issues Jira ya persistidos (normalizados) + sus tramos de
 * estado (`issue_status_segments`). Puerto 1:1 de `analyze()` +
 * `attention_reasons()` del board Python de referencia, pero sin re-parsear
 * el changelog crudo (eso ya lo hace `integrations/jira/parse.ts` en el
 * sync): aquí partimos de filas ya normalizadas.
 *
 * Nada de nombres de estado hardcodeados: el "estado de inicio de trabajo"
 * es el primero de `settings.statusFlow` cuyo macro-estado es `en_marcha`;
 * "entregado" es cualquier estado cuyo macro sea `entregada` o `cerrada`;
 * "bloqueado" es cualquier estado con macro `bloqueada`; "in review" es
 * `settings.reviewStatus` si se define, o si no el primer estado normalizado
 * cuyo nombre en minúsculas contiene "review".
 */
import { MacroStatus } from '@devboard/shared';
import type { issues, issueStatusSegments } from '../../db/schema.js';
import { hours, formatDays } from './time.js';

export type IssueRow = typeof issues.$inferSelect;
export type IssueStatusSegmentRow = typeof issueStatusSegments.$inferSelect;

/** Subconjunto de `SettingsDto` que necesitan las métricas de issues. */
export interface IssueMetricsSettings {
  statusFlow: string[];
  macroMap: Record<string, MacroStatus | string>;
  countedTypes: string[];
  attentionDays: number;
  reviewDays: number;
  /** Estado normalizado que representa "en revisión"; si no se da, se infiere por nombre. */
  reviewStatus?: string | null;
}

export interface AnalyzedSegment {
  status: string;
  startedAt: Date;
  endedAt: Date;
}

export interface AnalyzedIssue {
  key: string;
  type: string;
  summary: string;
  status: string;
  macro: MacroStatus | string;
  assigneeRaw: string | null;
  personId: number | null;
  epicKey: string | null;
  parentKey: string | null;
  created: Date;
  resolved: Date | null;
  counted: boolean;
  done: boolean;
  cycleHours: number | null;
  leadHours: number | null;
  deliveredAt: Date | null;
  timeInStatus: Record<string, number>;
  visits: Record<string, number>;
  inStatusHours: number;
  blockedVisits: number;
  blockedHours: number;
  ageHours: number;
  attention: string[];
  segments: AnalyzedSegment[];
}

function macroOf(status: string, settings: IssueMetricsSettings): MacroStatus | string {
  return settings.macroMap[status] ?? MacroStatus.Pending;
}

/** Primer estado del flujo cuyo macro-estado es "en marcha" (equivalente a `WORK_START`). */
export function workStartStatus(settings: IssueMetricsSettings): string | null {
  return settings.statusFlow.find((s) => macroOf(s, settings) === MacroStatus.InProgress) ?? null;
}

/** Estado "en revisión": explícito en settings, o el primero cuyo nombre contiene "review". */
export function reviewStatusOf(settings: IssueMetricsSettings): string | null {
  if (settings.reviewStatus) return settings.reviewStatus;
  return settings.statusFlow.find((s) => s.toLowerCase().includes('review')) ?? null;
}

function isDoneLike(macro: MacroStatus | string): boolean {
  return macro === MacroStatus.Delivered || macro === MacroStatus.Closed;
}

/**
 * Reconstruye los tramos "cerrados" (con `endedAt` real) de un issue,
 * cerrando el último tramo abierto en `now`.
 */
function closeSegments(segments: IssueStatusSegmentRow[], now: Date): AnalyzedSegment[] {
  const sorted = [...segments].sort((a, b) => a.seq - b.seq);
  return sorted.map((s) => ({ status: s.status, startedAt: s.startedAt, endedAt: s.endedAt ?? now }));
}

/**
 * Analiza un lote de issues + sus segmentos de estado. Función pura:
 * no accede a la base de datos.
 */
export function analyzeIssues(
  rows: IssueRow[],
  segments: IssueStatusSegmentRow[],
  settings: IssueMetricsSettings,
  now: Date,
): AnalyzedIssue[] {
  const segmentsByKey = new Map<string, IssueStatusSegmentRow[]>();
  for (const s of segments) {
    const list = segmentsByKey.get(s.issueKey) ?? [];
    list.push(s);
    segmentsByKey.set(s.issueKey, list);
  }

  const workStart = workStartStatus(settings);
  const reviewStatus = reviewStatusOf(settings);
  const backlogStatus = settings.statusFlow[0] ?? null;

  const out: AnalyzedIssue[] = [];
  for (const row of rows) {
    const raw = segmentsByKey.get(row.key);
    const closed = raw && raw.length > 0 ? closeSegments(raw, now) : [{ status: row.statusNorm, startedAt: row.createdAt, endedAt: now }];

    const tStart = workStart ? closed.find((s) => s.status === workStart) : undefined;
    const tEnd = closed.find(
      (s) => isDoneLike(macroOf(s.status, settings)) && s.startedAt > (tStart?.startedAt ?? row.createdAt),
    );

    const cycleHours = tStart && tEnd ? hours(tStart.startedAt, tEnd.startedAt) : null;
    const leadHours = tEnd ? hours(row.createdAt, tEnd.startedAt) : null;

    const visits: Record<string, number> = {};
    const timeInStatus: Record<string, number> = {};
    for (const seg of closed) {
      // Un tramo abierto en un estado "cerrada" (p.ej. Finalizada) no acumula tiempo: el issue ya
      // terminó; contarlo hasta `now` inflaría la media de ese estado (igual que el board original).
      const openInClosed = seg.endedAt === now && macroOf(seg.status, settings) === MacroStatus.Closed;
      visits[seg.status] = (visits[seg.status] ?? 0) + 1;
      if (!openInClosed) {
        timeInStatus[seg.status] = (timeInStatus[seg.status] ?? 0) + hours(seg.startedAt, seg.endedAt);
      }
    }

    const last = closed[closed.length - 1];
    const macro = macroOf(row.statusNorm, settings);
    const done = isDoneLike(macro);
    const inStatusHours = macro === MacroStatus.Closed ? 0 : hours(last.startedAt, last.endedAt);

    let blockedVisits = 0;
    let blockedHours = 0;
    for (const [status, n] of Object.entries(visits)) {
      if (macroOf(status, settings) === MacroStatus.Blocked) {
        blockedVisits += n;
        blockedHours += timeInStatus[status] ?? 0;
      }
    }

    const counted = row.type !== 'Subtarea' && settings.countedTypes.includes(row.type);

    const attention: string[] = [];
    if (macro === MacroStatus.Blocked) {
      attention.push(`bloqueada desde hace ${formatDays(inStatusHours)}`);
    }
    if (reviewStatus && row.statusNorm === reviewStatus && inStatusHours > 24 * settings.reviewDays) {
      attention.push(`lleva ${formatDays(inStatusHours)} esperando revisión`);
    } else if (!done && row.statusNorm !== backlogStatus && inStatusHours > 24 * settings.attentionDays) {
      attention.push(`lleva ${formatDays(inStatusHours)} en '${row.statusNorm}'`);
    }
    if (reviewStatus && (visits[reviewStatus] ?? 0) >= 2) {
      attention.push(`ha vuelto a revisión ${visits[reviewStatus]} veces`);
    }
    if (blockedVisits >= 2) {
      attention.push(`se ha bloqueado ${blockedVisits} veces`);
    }

    out.push({
      key: row.key,
      type: row.type,
      summary: row.summary,
      status: row.statusNorm,
      macro,
      assigneeRaw: row.assigneeRaw,
      personId: row.personId,
      epicKey: row.epicKey,
      parentKey: row.parentKey,
      created: row.createdAt,
      resolved: row.resolvedAt,
      counted,
      done,
      cycleHours,
      leadHours,
      deliveredAt: tEnd ? tEnd.startedAt : null,
      timeInStatus,
      visits,
      inStatusHours,
      blockedVisits,
      blockedHours,
      ageHours: hours(row.createdAt, now),
      attention,
      segments: closed,
    });
  }
  return out;
}
