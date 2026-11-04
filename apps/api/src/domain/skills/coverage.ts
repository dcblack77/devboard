/**
 * Cobertura y bus factor del mapa de skills. Funciones puras sobre la matriz persona × skill:
 * solo cuentan personas activas. Riesgo: rojo si ≤ 1 persona con nivel ≥ 2, ámbar si 2,
 * verde si ≥ 3.
 */
import type { SkillCoverageDto, SkillRisk } from '@devboard/shared';

export interface CoveragePerson {
  id: number;
  active: boolean;
}

export interface CoverageRow {
  personId: number;
  skillId: number;
  level: number;
}

export interface CoverageInput {
  skillIds: number[];
  people: CoveragePerson[];
  rows: CoverageRow[];
}

export function riskFor(count2plus: number): SkillRisk {
  if (count2plus <= 1) return 'red';
  if (count2plus === 2) return 'amber';
  return 'green';
}

function activeIds(people: CoveragePerson[]): Set<number> {
  return new Set(people.filter((p) => p.active).map((p) => p.id));
}

export function coverage(input: CoverageInput): SkillCoverageDto[] {
  const active = activeIds(input.people);
  const stats = new Map<number, { count2plus: number; count3: number }>();
  for (const id of input.skillIds) stats.set(id, { count2plus: 0, count3: 0 });

  for (const row of input.rows) {
    if (!active.has(row.personId)) continue;
    const s = stats.get(row.skillId);
    if (!s) continue;
    if (row.level >= 2) s.count2plus += 1;
    if (row.level >= 3) s.count3 += 1;
  }

  return input.skillIds.map((skillId) => {
    const s = stats.get(skillId)!;
    return { skillId, count2plus: s.count2plus, count3: s.count3, busFactor: s.count2plus, risk: riskFor(s.count2plus) };
  });
}

/** Skills en las que `personId` es la única persona activa con nivel ≥ 2. */
export function soleOwnerSkills(personId: number, input: { people: CoveragePerson[]; rows: CoverageRow[] }): number[] {
  const active = activeIds(input.people);
  const ownersBySkill = new Map<number, Set<number>>();
  for (const row of input.rows) {
    if (row.level < 2 || !active.has(row.personId)) continue;
    const set = ownersBySkill.get(row.skillId) ?? new Set<number>();
    set.add(row.personId);
    ownersBySkill.set(row.skillId, set);
  }
  return [...ownersBySkill.entries()]
    .filter(([, owners]) => owners.size === 1 && owners.has(personId))
    .map(([skillId]) => skillId)
    .sort((a, b) => a - b);
}

export interface ExistingRowRef {
  personId: number;
  skillId: number;
  source: 'manual' | 'auto';
}

export interface AutoSuggestionRow {
  personId: number;
  skillId: number;
  level: number;
  evidence: string | null;
}

/**
 * Filtra las sugerencias automáticas que sí deben escribirse: las que no tienen fila previa o
 * cuya fila previa es `auto`. Las filas `manual` ganan siempre.
 */
export function planAutoUpserts(existing: ExistingRowRef[], suggestions: AutoSuggestionRow[]): AutoSuggestionRow[] {
  const manual = new Set(existing.filter((r) => r.source === 'manual').map((r) => `${r.personId}:${r.skillId}`));
  return suggestions.filter((s) => !manual.has(`${s.personId}:${s.skillId}`));
}
