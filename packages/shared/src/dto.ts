import type { MacroStatus, Role, SnapshotKind, SyncSource } from './enums.js';

/** Respuesta de `GET /api/health`. */
export interface HealthResponse {
  ok: boolean;
  db: boolean;
  version: string;
}

/** Respuesta de `GET /api/auth/me`. */
export interface MeResponse {
  role: Role | null;
  /** `true` si el servidor no tiene contraseña (todo el mundo entra como TL). */
  authDisabled?: boolean;
}

/** Cuerpo de `POST /api/auth/login`. */
export interface LoginRequest {
  password: string;
}

/** Respuesta de login. */
export interface LoginResponse {
  role: Role;
}

/** Fila resumida de `sync_runs`, expuesta en `GET /api/sync/status`. */
export interface SyncRunDto {
  id: number;
  source: SyncSource | string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  error: string | null;
  counts: Record<string, number>;
}

/** Salud de una fuente de sincronización (expuesta en `GET /api/sync/status`). */
export interface SyncSourceHealthDto {
  /** Fin de la última ejecución correcta, o null si nunca hubo una. */
  lastOkAt: string | null;
  /**
   * `true` si la última ejecución falló o no hay ninguna correcta en los últimos
   * 3 × `settings.syncMinutes`: los datos mostrados no son fiables.
   */
  stale: boolean;
  /** Error de la última ejecución (null si fue correcta). */
  lastError: string | null;
}

/** Salud por fuente. */
export interface SyncHealthDto {
  jira: SyncSourceHealthDto;
  github: SyncSourceHealthDto;
  /** Tablero de soporte: `stale=false` si no está registrado o no hay tablero configurado. */
  support: SyncSourceHealthDto;
}

/** Respuesta de `GET /api/sync/status`: últimas ejecuciones + salud por fuente. */
export interface SyncStatusDto {
  runs: SyncRunDto[];
  health: SyncHealthDto;
}

/** Estado de una fuente en `GET /api/sync/state`. */
export interface SyncSourceStateDto {
  source: SyncSource | string;
  /** Fin de la última sincronización correcta: los datos están al día hasta aquí. */
  lastOkAt: string | null;
  /** Resultado de la última ejecución (null si está en curso o no hubo ninguna). */
  lastRunOk: boolean | null;
  lastError: string | null;
}

/** Respuesta de `GET /api/sync/state`: frescura de los datos y si hay una actualización en curso. */
export interface SyncStateDto {
  running: boolean;
  sources: SyncSourceStateDto[];
}

/** PR de GitHub enlazada a una issue (por clave en título o rama). */
export interface LinkedPrDto {
  repo: string;
  number: number;
  url: string;
  state: 'open' | 'draft' | 'merged' | 'closed';
}

/** Respuesta de `GET /api/links`. */
export interface IssueLinksResponse {
  /** Prefijo para abrir una issue en Jira (`<url>/browse/`); `null` si no se puede derivar. */
  jiraBrowseUrl: string | null;
  /** PRs por clave de issue (en mayúsculas), más recientes primero. */
  prsByIssue: Record<string, LinkedPrDto[]>;
}

/** Umbrales de semáforos configurables (ver PLAN.md § Semáforos). */
export interface Thresholds {
  balanceRed: number;
  balanceAmber: number;
  responseGreenHours: number;
  responseRedHours: number;
  firstReviewGreenHours: number;
  firstReviewRedHours: number;
  noApprovalRed: number;
  stalePrsRed: number;
  blockedRed: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  balanceRed: 0.5,
  balanceAmber: 0.8,
  responseGreenHours: 8,
  responseRedHours: 48,
  firstReviewGreenHours: 24,
  firstReviewRedHours: 48,
  noApprovalRed: 1,
  stalePrsRed: 3,
  blockedRed: 1,
};

/** Orden del flujo de estados Jira configurado (nombres normalizados). */
export type StatusFlow = string[];

/** Alias de estado (nombre crudo de Jira -> nombre normalizado). */
export type StatusAliases = Record<string, string>;

/** Mapa de estado normalizado -> macro-estado. */
export type MacroMap = Record<string, MacroStatus>;

/** Tipos de issue que cuentan para throughput/cycle (p.ej. Historia, Tarea, Error). */
export type CountedTypes = string[];

/** Objetivos de SLA de soporte para una prioridad (horas, positivas). */
export interface SupportSlaTarget {
  firstResponseHours?: number;
  resolutionHours?: number;
}

/** SLA de soporte por nombre de prioridad de Jira. */
export type SupportSla = Record<string, SupportSlaTarget>;

/** Fila singleton `settings`. */
export interface SettingsDto {
  id: number;
  jiraProject: string | null;
  sinceDate: string | null;
  syncMinutes: number;
  attentionDays: number;
  reviewDays: number;
  waitReviewHours: number;
  thresholds: Thresholds;
  statusFlow: StatusFlow;
  statusAliases: StatusAliases;
  macroMap: MacroMap;
  countedTypes: CountedTypes;
  hotfixRegex: string | null;
  /** Vista "Sistema" (DORA): nombre del workflow de despliegue a producción. */
  deployWorkflow: string;
  /** Regex sobre `head_branch` de los despliegues que cuentan como producción. */
  deployBranches: string;
  /** Regex sobre el nombre de workflow que identifica CI. */
  ciWorkflowRegex: string;
  /** Rama base cuyos PRs cuentan como "feature PR". */
  featureBase: string;
  /** Clave Jira del tablero de soporte (null = sin soporte). */
  supportProject: string | null;
  /** Estado de soporte que significa "escalado al equipo técnico". */
  supportTechStatus: string | null;
  /** SLA de soporte por prioridad. */
  supportSla: SupportSla;
}

export interface SnapshotDto {
  id: number;
  takenAt: string;
  kind: SnapshotKind | string;
  payload: unknown;
}

/** Respuesta de `GET /api/home`: cifras de portada (Compromiso/Entrega/Riesgo/Calidad). */
export interface HomeResponse {
  numbers: unknown;
  trend: unknown;
  rag: unknown;
  ragCounts: { green: number; amber: number; red: number };
}

/** Respuesta de `GET /api/jira`. */
export interface JiraResponse {
  statuses: string[];
  statusStats: unknown;
  daysByStateType: unknown;
  issues: unknown;
}

/** Respuesta de `GET /api/github`. */
export interface GithubResponse {
  reviewStats: unknown;
  prs: unknown;
}

/** Respuesta de `GET /api/people`: vista RRHH por persona, sin comparativas entre ellas. */
export interface PeopleResponse {
  people: unknown;
}

/** Respuesta de `GET /api/initiatives` y `GET /api/initiatives/:slug`. */
export interface InitiativesResponse {
  initiatives: unknown;
}

/** Respuesta de `GET /api/epics`. */
export interface EpicsResponse {
  epics: unknown;
}

/** Respuesta de `GET /api/data/issues` y `GET /api/data/prs`. */
export interface DataResponse {
  items: unknown;
}

/** Respuesta de `GET /api/team`: ranking + medianas + resúmenes por persona. */
export interface TeamResponse {
  rank: unknown;
  medians: unknown;
  summaries: unknown;
}

/** Respuesta de `GET /api/team/:slug` y `GET /api/me/:slug`. */
export interface PersonDetailResponse {
  metrics: unknown;
  summary: unknown;
  devStat?: unknown;
}


// ---- Vista "Sistema" (DORA + práctica de PRs + flujo Kanban) ----

export interface DoraRepoDto {
  repo: string;
  deploys: number;
  deploysPerWeek: number;
  cfr: number | null;
  hotfixPct: number | null;
  leadTimeH: { p50: number | null; p85: number | null };
  codingH: number | null;
  pickupH: number | null;
  reviewH: number | null;
  mergeToProdH: number | null;
  recoveryH: number | null;
}

export interface PracticeDto {
  period: string;
  prs: number;
  sizeP50: number | null;
  pctOver400: number | null;
  pickupP50H: number | null;
  firstReviewToMergeP50H: number | null;
  humanReviewsPerPr: number | null;
  pctMergedWithoutHumanApproval: number | null;
}

export interface KanbanStateDto {
  status: string;
  p50H: number | null;
  pctOfTickets: number | null;
}

export interface KanbanFlowDto {
  tickets: number;
  cycleKanbanH: number | null;
  cycleKanbanP85H: number | null;
  engineeringH: number | null;
  waitingH: number | null;
  pctWithWait: number | null;
  flowEfficiency: number | null;
  states: KanbanStateDto[];
  reworkPct: number | null;
  closedBeforeDeliveredPct: number | null;
}

export interface ClosureDayDto {
  date: string;
  closed: number;
  closedAll: number;
  viaQaNegocio: number;
}

export interface BatchesDto {
  days: ClosureDayDto[];
  batches: ClosureDayDto[];
  weekdayHistogram: number[];
  hourHistogram: number[];
}

export interface SystemResponse {
  window: { from: string; to: string };
  repos: DoraRepoDto[];
  practice: { byQuarter: PracticeDto[]; byMonth: PracticeDto[] };
  flow: KanbanFlowDto;
  batches: BatchesDto;
  definitions: Record<string, string>;
}
