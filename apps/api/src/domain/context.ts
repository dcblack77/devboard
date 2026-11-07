/**
 * Contexto de métricas cacheado: carga todas las tablas necesarias de
 * Postgres, ejecuta el dominio puro de métricas (issues → devStats →
 * initiativeStats → statusStats → daysByStateType → PRs → reviewStats →
 * homeSummary) y expone el resultado listo para los controladores JSON.
 *
 * Se cachea en memoria de proceso: `getMetricsContext()` reutiliza el
 * último resultado hasta que se llama a `invalidateMetricsContext()` (al
 * terminar cada sync).
 */
import { asc, eq } from 'drizzle-orm';
import { MacroStatus, type SettingsDto } from '@devboard/shared';
import { getDb } from '../db/client.js';
import {
  epics,
  initiativeEpics,
  initiatives as initiativesTable,
  issueAssigneeChanges,
  issueStatusSegments,
  issues,
  people,
  prReviewRequests,
  prReviews,
  pullRequests,
  settings as settingsTable,
  workflowRuns,
} from '../db/schema.js';
import type { EpicWithChildren } from '../integrations/jira/types.js';
import { analyzeIssues, type AnalyzedIssue, type IssueMetricsSettings } from './metrics/issues.js';
import { devStats, type DevStat } from './metrics/people.js';
import { initiativeStats, type InitiativeInput, type InitiativeStat } from './metrics/initiatives.js';
import { statusStats, daysByStateType, type StatusStat, type DaysByStateType } from './metrics/status.js';
import {
  analyzePullRequests,
  reviewStats,
  type AnalyzedPr,
  type GithubMetricsSettings,
  type ReviewStats,
} from './metrics/github.js';
import { homeSummary, type HomeSummary } from './metrics/home.js';
import { jiraBrowseBase } from '../integrations/jira/browse.js';
import { loadEnv } from '../config/env.js';
import { weekLabels } from './metrics/time.js';

export interface PersonRow {
  id: number;
  name: string;
  jiraNames: string[];
  githubLogins: string[];
}

import type { SystemInput } from './metrics/system.js';
import { toSystemIssues, toSystemPrs, toSystemRuns, toSystemSettings } from '../modules/system/system.adapter.js';

export interface MetricsContext {
  now: Date;
  settings: SettingsDto;
  issueSettings: IssueMetricsSettings;
  githubSettings: GithubMetricsSettings;
  weeks: string[];
  peopleList: PersonRow[];
  /** Nombre/login crudo -> nombre canónico (fallback: el mismo valor recibido). */
  canon: (raw: string) => string;
  epicIndex: Record<string, EpicWithChildren>;
  rows: AnalyzedIssue[];
  dstats: DevStat[];
  statusStats: StatusStat[];
  daysByStateType: DaysByStateType;
  initiativesList: InitiativeStat[];
  gh: ReviewStats | null;
  prs: AnalyzedPr[];
  home: HomeSummary;
  /** Entradas tipadas de la vista "Sistema" (tramos con alias aplicados y fusionados). */
  system: SystemInput;
}

/** Carga la fila singleton `settings` y la convierte al DTO público. */
function toSettingsDto(row: typeof settingsTable.$inferSelect): SettingsDto {
  return {
    id: row.id,
    jiraBoards: (row.jiraBoards as SettingsDto['jiraBoards']) ?? [],
    sinceDate: row.sinceDate,
    syncMinutes: row.syncMinutes,
    attentionDays: row.attentionDays,
    reviewDays: row.reviewDays,
    waitReviewHours: row.waitReviewHours,
    thresholds: row.thresholds as SettingsDto['thresholds'],
    statusFlow: row.statusFlow as string[],
    statusAliases: row.statusAliases as Record<string, string>,
    macroMap: row.macroMap as Record<string, MacroStatus>,
    countedTypes: row.countedTypes as string[],
    hotfixRegex: row.hotfixRegex,
    deployWorkflow: row.deployWorkflow,
    deployBranches: row.deployBranches,
    ciWorkflowRegex: row.ciWorkflowRegex,
    featureBase: row.featureBase,
    supportTechStatus: row.supportTechStatus,
    supportSla: row.supportSla as SettingsDto['supportSla'],
  };
}

/** Construye la función `canon(raw)`: nombre/login crudo -> nombre canónico de `people`. */
function buildCanon(peopleList: PersonRow[]): (raw: string) => string {
  const map = new Map<string, string>();
  for (const p of peopleList) {
    for (const jiraName of p.jiraNames) map.set(jiraName, p.name);
    for (const login of p.githubLogins) map.set(login, p.name);
  }
  return (raw: string): string => map.get(raw) ?? raw;
}

/**
 * Construye `epicIndex` a partir de las filas `epics` + `issues` cuyo
 * `epicKey` apunta a esa épica: TODOS los hijos, sin ventana temporal
 * (el `pctDone` de una épica no debe depender del recorte por fecha).
 */
function buildEpicIndex(
  epicRows: (typeof epics.$inferSelect)[],
  allIssues: (typeof issues.$inferSelect)[],
): Record<string, EpicWithChildren> {
  const childrenByEpic = new Map<string, (typeof issues.$inferSelect)[]>();
  for (const issue of allIssues) {
    if (!issue.epicKey) continue;
    const list = childrenByEpic.get(issue.epicKey) ?? [];
    list.push(issue);
    childrenByEpic.set(issue.epicKey, list);
  }

  const out: Record<string, EpicWithChildren> = {};
  for (const e of epicRows) {
    out[e.key] = {
      key: e.key,
      summary: e.summary,
      status: e.status,
      assigneeRaw: e.assigneeRaw,
      createdAt: e.createdAt,
      startDate: e.startDate ?? null,
      dueDate: e.dueDate ?? null,
      resolvedAt: e.resolvedAt ?? null,
      children: (childrenByEpic.get(e.key) ?? []).map((c) => ({
        key: c.key,
        summary: c.summary,
        type: c.type,
        status: c.statusNorm,
        assigneeRaw: c.assigneeRaw,
        dueDate: c.dueDate ?? null,
        storyPoints: c.storyPoints ?? null,
      })),
    };
  }
  return out;
}

/**
 * Recorta filas por fecha de creación >= `sinceDate` de settings (si está
 * configurada); sin recorte si no hay `sinceDate`. Épicas y sus hijos NUNCA
 * se recortan (se usan completas en `epicIndex`).
 */
function windowFilter<T extends { createdAt: Date }>(rows: T[], sinceDate: string | null): T[] {
  if (!sinceDate) return rows;
  const since = new Date(sinceDate);
  if (Number.isNaN(since.getTime())) return rows;
  return rows.filter((r) => r.createdAt >= since);
}

/**
 * Carga todas las tablas necesarias de Postgres y construye el
 * `MetricsContext` completo ejecutando el dominio puro de métricas.
 * Función pura de efectos de lectura: no cachea ni escribe.
 */
export async function buildMetricsContext(now: Date = new Date()): Promise<MetricsContext> {
  const db = getDb();

  const [settingsRows, peopleRows, initiativeRows, initiativeEpicRows, issueRows, segmentRows, epicRows, prRows, reviewRows, requestRows, runRows] =
    await Promise.all([
      db.select().from(settingsTable).where(eq(settingsTable.id, 1)).limit(1),
      db.select().from(people),
      db.select().from(initiativesTable).orderBy(asc(initiativesTable.position)),
      db.select().from(initiativeEpics),
      db.select().from(issues),
      db.select().from(issueStatusSegments),
      db.select().from(epics),
      db.select().from(pullRequests),
      db.select().from(prReviews),
      db.select().from(prReviewRequests),
      db.select().from(workflowRuns),
    ]);

  if (settingsRows.length === 0) {
    throw new Error('No hay fila settings (id=1): ejecuta el seed antes de construir el contexto de métricas.');
  }
  const settingsDto = toSettingsDto(settingsRows[0]!);

  const peopleList: PersonRow[] = peopleRows.map((p) => ({
    id: p.id,
    name: p.name,
    jiraNames: p.jiraNames,
    githubLogins: p.githubLogins,
  }));
  const canon = buildCanon(peopleList);

  const issueSettings: IssueMetricsSettings = {
    statusFlow: settingsDto.statusFlow,
    macroMap: settingsDto.macroMap,
    countedTypes: settingsDto.countedTypes,
    attentionDays: settingsDto.attentionDays,
    reviewDays: settingsDto.reviewDays,
  };
  const githubSettings: GithubMetricsSettings = {
    jiraBoards: settingsDto.jiraBoards,
    waitReviewHours: settingsDto.waitReviewHours,
  };

  // Re-normalización al leer: el sync guardó `statusNorm`/`macro` con los alias vigentes en ese
  // momento; si el flujo se edita en Ajustes, aplicamos los alias actuales sobre el estado crudo
  // (issues) y sobre cada tramo (segments) para no depender de una resincronización.
  const aliases = settingsDto.statusAliases ?? {};
  const normStatus = (s: string): string => aliases[s] ?? s;
  const renormalizedIssues = issueRows.map((i) => {
    const statusNorm = normStatus(i.status);
    // El assignee crudo de Jira se canoniza aquí (mapa `people.jiraNames`), igual que los logins
    // de GitHub en analyzePullRequests: así ambos mundos comparten el mismo nombre mostrado.
    const assigneeRaw = i.assigneeRaw ? canon(i.assigneeRaw) : i.assigneeRaw;
    return { ...i, statusNorm, assigneeRaw, macro: settingsDto.macroMap[statusNorm] ?? i.macro };
  });
  const renormalizedSegments = segmentRows.map((s) => ({ ...s, status: normStatus(s.status) }));

  const epicIndex = buildEpicIndex(epicRows, renormalizedIssues);

  const since = settingsDto.sinceDate ? new Date(settingsDto.sinceDate) : null;
  const weeks = weekLabels(now, since);

  // La ventana temporal recorta issues/PRs por fecha de creación; las épicas y sus hijos
  // (epicIndex) se mantienen completos para que pctDone no mienta.
  const windowedIssues = windowFilter(
    renormalizedIssues.filter((i) => i.type !== 'Epic'),
    settingsDto.sinceDate,
  );
  const windowedKeys = new Set(windowedIssues.map((i) => i.key));
  const windowedSegments = renormalizedSegments.filter((s) => windowedKeys.has(s.issueKey));

  const rows = analyzeIssues(windowedIssues, windowedSegments, issueSettings, now);
  const dstats = devStats(rows, epicIndex, issueSettings, now, weeks);
  const statusStatsResult = statusStats(rows, now, issueSettings.statusFlow);
  const daysByStateTypeResult = daysByStateType(rows);

  const initiativeInputs: InitiativeInput[] = initiativeRows.map((i) => ({
    name: i.name,
    slug: i.slug,
    epics: initiativeEpicRows.filter((ie) => ie.initiativeId === i.id).map((ie) => ie.epicKey),
  }));
  const initiativesList = initiativeStats(initiativeInputs, epicIndex, rows, weeks, now, issueSettings, {
    jiraBrowseUrl: jiraBrowseBase(loadEnv().JIRA_BASE_URL),
  });

  const windowedPrs = windowFilter(prRows, settingsDto.sinceDate);
  const windowedPrIds = new Set(windowedPrs.map((p) => p.id));
  const windowedReviews = reviewRows.filter((r) => windowedPrIds.has(r.prId));
  const windowedRequests = requestRows.filter((r) => windowedPrIds.has(r.prId));

  const prs = analyzePullRequests(windowedPrs, windowedReviews, windowedRequests, githubSettings, now, canon);
  const gh = prs.length > 0 || windowedPrs.length > 0 ? reviewStats(prs, now, weeks, githubSettings) : null;

  const home = homeSummary(rows, dstats, { now, settings: issueSettings, initiativesList, gh });

  const system: SystemInput = {
    prs: toSystemPrs(windowedPrs, windowedReviews),
    runs: toSystemRuns(runRows),
    issues: toSystemIssues(rows, aliases),
    settings: toSystemSettings(settingsDto),
  };

  return {
    now,
    settings: settingsDto,
    issueSettings,
    githubSettings,
    weeks,
    peopleList,
    canon,
    epicIndex,
    rows,
    dstats,
    statusStats: statusStatsResult,
    daysByStateType: daysByStateTypeResult,
    initiativesList,
    gh,
    prs,
    home,
    system,
  };
}

let cached: MetricsContext | undefined;
let inflight: Promise<MetricsContext> | undefined;

/**
 * Devuelve el contexto de métricas cacheado en memoria; lo construye la
 * primera vez (o tras `invalidateMetricsContext()`). Llamadas concurrentes
 * mientras se construye comparten la misma promesa (no duplican trabajo).
 */
export async function getMetricsContext(): Promise<MetricsContext> {
  if (cached) return cached;
  if (!inflight) {
    inflight = buildMetricsContext()
      .then((ctx) => {
        cached = ctx;
        return ctx;
      })
      .finally(() => {
        inflight = undefined;
      });
  }
  return inflight;
}

/** Invalida la caché de métricas: la próxima `getMetricsContext()` recarga de Postgres. */
export function invalidateMetricsContext(): void {
  cached = undefined;
  inflight = undefined;
}
