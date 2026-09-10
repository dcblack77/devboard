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
}

export interface SnapshotDto {
  id: number;
  takenAt: string;
  kind: SnapshotKind | string;
  payload: unknown;
}
