/**
 * DTOs de administración (Fase 2.7): settings editable, gestión de personas e
 * iniciativas, descubrimiento de datos sin mapear y snapshots históricos.
 * Separado de `dto.ts` para no chocar con otro subagente que lo edita en paralelo.
 */
import type { SettingsDto, SupportSla, Thresholds } from './dto.js';
import type { SnapshotKind } from './enums.js';

/** Cuerpo de `PUT /api/settings`: todos los campos editables de `SettingsDto` menos `id`. */
export interface UpdateSettingsRequest {
  jiraProject?: string | null;
  sinceDate?: string | null;
  syncMinutes?: number;
  attentionDays?: number;
  reviewDays?: number;
  waitReviewHours?: number;
  thresholds?: Thresholds;
  statusFlow?: string[];
  statusAliases?: Record<string, string>;
  macroMap?: Record<string, string>;
  countedTypes?: string[];
  hotfixRegex?: string | null;
  deployWorkflow?: string;
  deployBranches?: string;
  ciWorkflowRegex?: string;
  featureBase?: string;
  supportProject?: string | null;
  supportTechStatus?: string | null;
  supportSla?: SupportSla;
}

/** Respuesta de `GET/PUT /api/settings`. */
export interface SettingsAdminResponse {
  settings: SettingsDto;
}

/** Fila `people`, expuesta para administración. */
export interface PersonAdminDto {
  id: number;
  name: string;
  jiraNames: string[];
  githubLogins: string[];
  note: string | null;
  active: boolean;
}

/** Cuerpo de `POST /api/settings/people`. */
export interface CreatePersonRequest {
  name: string;
  jiraNames?: string[];
  githubLogins?: string[];
  note?: string | null;
  active?: boolean;
}

/** Cuerpo de `PUT /api/settings/people/:id`. */
export interface UpdatePersonRequest {
  name?: string;
  jiraNames?: string[];
  githubLogins?: string[];
  note?: string | null;
  active?: boolean;
}

export interface PeopleAdminResponse {
  people: PersonAdminDto[];
}

export interface PersonAdminItemResponse {
  person: PersonAdminDto;
}

/** Origen de una iniciativa: creada a mano, creada por el sync desde una épica, o auto renombrada a mano. */
export type InitiativeSource = 'manual' | 'auto' | 'manual-renamed';

/** Fila `initiatives` + claves de épicas asociadas (tabla `initiative_epics`). */
export interface InitiativeAdminDto {
  id: number;
  name: string;
  slug: string;
  position: number;
  source: InitiativeSource;
  /** Épica origen cuando `source !== 'manual'`. */
  epicKey: string | null;
  epicKeys: string[];
}

/** Cuerpo de `POST /api/settings/initiatives`. */
export interface CreateInitiativeRequest {
  name: string;
  slug: string;
  position?: number;
  epicKeys?: string[];
}

/** Cuerpo de `PUT /api/settings/initiatives/:id`. */
export interface UpdateInitiativeRequest {
  name?: string;
  slug?: string;
  position?: number;
  epicKeys?: string[];
}

export interface InitiativesAdminResponse {
  initiatives: InitiativeAdminDto[];
}

export interface InitiativeAdminItemResponse {
  initiative: InitiativeAdminDto;
}

/** Resumen mínimo de una épica sin iniciativa asignada. */
export interface UnmappedEpic {
  key: string;
  summary: string;
}

/** Respuesta de `GET /api/settings/discover`: huecos de mapeo/configuración. */
export interface DiscoverResponse {
  repos: string[];
  epicsWithoutInitiative: UnmappedEpic[];
  unmappedGithubLogins: string[];
  unmappedJiraNames: string[];
}

/** Fila resumida de `snapshots`, sin el payload completo (para listados). */
export interface SnapshotListItemDto {
  id: number;
  takenAt: string;
  kind: SnapshotKind | string;
}

export interface SnapshotListResponse {
  snapshots: SnapshotListItemDto[];
}

export interface SnapshotDetailResponse {
  id: number;
  takenAt: string;
  kind: SnapshotKind | string;
  payload: unknown;
}
