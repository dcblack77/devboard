/**
 * DTOs del mapa de skills: catálogo (competencias, stack, dominio), matriz persona × skill
 * con nivel 0–3, cobertura / bus factor por skill y administración (catálogo, niveles
 * manuales, seniority). Separado de `dto.ts` / `dto-admin.ts` para mantenerlos estables.
 */

/** Categoría de una skill: competencia transversal, pieza de stack o dominio (repo / épica). */
export type SkillCategory = 'competency' | 'stack' | 'domain';

/** Nivel 0 = no ha tocado · 1 = con ayuda · 2 = autónomo · 3 = referente. */
export type SkillLevel = 0 | 1 | 2 | 3;

/** Origen de una fila de la matriz: fijada a mano (gana siempre) o sugerida por el recálculo. */
export type SkillSource = 'manual' | 'auto';

/** Etiqueta global de seniority de una persona (solo manual). */
export type Seniority = 'junior' | 'mid' | 'senior';

/** Riesgo de bus factor de una skill: rojo ≤ 1 persona autónoma, ámbar = 2, verde ≥ 3. */
export type SkillRisk = 'red' | 'amber' | 'green';

export interface SkillDto {
  id: number;
  name: string;
  category: SkillCategory;
  description: string | null;
  sortOrder: number;
  active: boolean;
}

export interface SkillPersonDto {
  id: number;
  name: string;
  seniority: Seniority | null;
  /** Rol manual (etiqueta libre) fijado por el TL; `null` si no se ha fijado. */
  role: string | null;
}

/** Forma del conocimiento derivada de la matriz. */
export type ProfileShape = 'specialist' | 't-shaped' | 'generalist' | 'learning';

/** Perfil de contribución en código (mismos umbrales que el informe mensual). */
export type ProfileContribution = 'guardian' | 'builder' | 'balanced' | 'occasional' | 'low';

export type RoleSource = 'manual' | 'suggested';

/** Skill referenciada desde el perfil, con el nivel de la persona. */
export interface ProfileSkillRef {
  skillId: number;
  name: string;
  level: number;
  evidence?: string | null;
}

/** Perfil derivado de una persona (`GET /api/team/:slug/skills`). */
export interface PersonProfileDto {
  personId: number;
  shape: ProfileShape;
  contribution: ProfileContribution;
  suggestedRole: string | null;
  /** Rol manual si existe, si no el sugerido. */
  role: string | null;
  roleSource: RoleSource | null;
  /** Skills a nivel 3. */
  referentIn: ProfileSkillRef[];
  /** Skills a nivel 3 donde ninguna otra persona activa llega a 2. */
  soleReferentIn: ProfileSkillRef[];
  /** Dominios (repos / épicas) con nivel ≥ 2, los más relevantes primero (máx. 6). */
  domainTop: ProfileSkillRef[];
  /** Competencias / stack donde la persona está ≤ 1 y al menos la mitad del equipo ≥ 2 (máx. 5). */
  gaps: ProfileSkillRef[];
  /** Resumen de una frase en español. */
  summary: string;
}

/** Perfil resumido por persona (`GET /api/skills`). */
export type PersonProfileSummaryDto = Pick<PersonProfileDto, 'personId' | 'shape' | 'contribution' | 'role' | 'roleSource' | 'summary'>;

/** Celda de la matriz persona × skill. */
export interface PersonSkillDto {
  personId: number;
  skillId: number;
  level: SkillLevel;
  source: SkillSource;
  evidence: string | null;
}

/** Cobertura de una skill entre las personas activas. */
export interface SkillCoverageDto {
  skillId: number;
  /** Personas con nivel ≥ 2 (autónomas o referentes). */
  count2plus: number;
  /** Personas con nivel 3 (referentes). */
  count3: number;
  /** = `count2plus`: cuántas personas tendrían que faltar para perder la skill. */
  busFactor: number;
  risk: SkillRisk;
}

/** Respuesta de `GET /api/skills`. */
export interface SkillsResponse {
  skills: SkillDto[];
  people: SkillPersonDto[];
  matrix: PersonSkillDto[];
  coverage: SkillCoverageDto[];
  profiles: PersonProfileSummaryDto[];
}

/** Respuesta de `GET /api/team/:slug/skills`. */
export interface PersonSkillsResponse {
  person: SkillPersonDto;
  skills: SkillDto[];
  rows: PersonSkillDto[];
  /** Skills en las que esta persona es la única con nivel ≥ 2. */
  soleOwnerOf: number[];
  profile: PersonProfileDto;
}

/** Cuerpo de `POST /api/settings/skills` (solo competencias y stack; el dominio es automático). */
export interface CreateSkillRequest {
  name: string;
  category: 'competency' | 'stack';
  description?: string | null;
  sortOrder?: number;
}

/** Cuerpo de `PUT /api/settings/skills/:skillId`. */
export interface UpdateSkillRequest {
  name?: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export interface SkillItemResponse {
  skill: SkillDto;
}

/** Cuerpo de `PUT /api/settings/people/:personId/skills/:skillId`. */
export interface SetPersonSkillRequest {
  level: SkillLevel;
  evidence?: string | null;
}

export interface PersonSkillItemResponse {
  row: PersonSkillDto;
}

/** Cuerpo de `PUT /api/settings/people/:personId/seniority`. */
export interface SetSeniorityRequest {
  seniority: Seniority | null;
}

/** Cuerpo de `PUT /api/settings/people/:personId/role`. */
export interface SetRoleRequest {
  role: string | null;
}

/** Respuesta de `POST /api/skills/recompute`. */
export interface RecomputeSkillsResponse {
  domainSkillsCreated: number;
  rowsUpserted: number;
}
