/**
 * Perfil derivado de una persona a partir de la matriz de skills y de su actividad en código:
 * forma del conocimiento (especialista, T-shaped, generalista, en formación), perfil de
 * contribución (umbrales idénticos al informe mensual del equipo), rol sugerido por reglas,
 * referencias, huecos frente al equipo y un resumen de una frase. Funciones puras.
 */
import type { PersonProfileDto, PersonSkillDto, ProfileContribution, ProfileShape, SkillDto, SkillPersonDto } from '@teampulse/shared';
import type { ActivitySnapshot } from '../../modules/skills/skills.repo.js';

export interface ProfileActivity {
  mergedPrs: number;
  reviewsGiven: number;
  monthsActive: number;
}

export interface ProfileInput {
  person: SkillPersonDto;
  /** Catálogo activo. */
  skills: SkillDto[];
  /** Filas de esta persona. */
  rows: PersonSkillDto[];
  /** Filas de todas las personas activas (incluida esta). */
  teamRows: PersonSkillDto[];
  activity: ProfileActivity;
}

export type PersonProfile = PersonProfileDto;

export const SHAPE_LABEL: Record<ProfileShape, string> = {
  specialist: 'Especialista',
  't-shaped': 'T-shaped',
  generalist: 'Generalista',
  learning: 'En formación',
};

export const CONTRIBUTION_LABEL: Record<ProfileContribution, string> = {
  guardian: 'Guardián (revisa más de lo que escribe)',
  builder: 'Constructor (escribe más de lo que revisa)',
  balanced: 'Equilibrado',
  occasional: 'Puntual',
  low: 'Baja actividad en código',
};

/** Reglas de rol sugerido, en orden de prioridad. Los nombres se comparan por prefijo, sin mayúsculas. */
const ROLE_RULES: Array<{ role: string; test: (levelOf: (name: string) => number, ctx: RoleContext) => boolean }> = [
  { role: 'Platform / Infra', test: (l) => l('SST / IaC') >= 2 && l('AWS Lambda / serverless') >= 2 && l('CI/CD') >= 2 },
  { role: 'Quality champion', test: (l) => l('Calidad y review') === 3 && l('Testing (unit + integración)') >= 2 },
  { role: 'Mentor', test: (l) => l('Colaboración y mentoría') === 3 },
  { role: 'Backend owner', test: (_l, ctx) => ctx.repoSkillsAt3 >= 2 },
  { role: 'Backend', test: (_l, ctx) => ctx.stackSkillsAt2plus >= 3 },
];

interface RoleContext {
  repoSkillsAt3: number;
  stackSkillsAt2plus: number;
}

export function classifyShape(levels: number[]): ProfileShape {
  const at3 = levels.filter((l) => l === 3).length;
  const at2 = levels.filter((l) => l === 2).length;
  const at2plus = at3 + at2;
  if (at2plus < 2) return 'learning';
  if (at3 >= 1 && at2 >= 3) return 't-shaped';
  if (at3 === 1 && at2 <= 2) return 'specialist';
  if (at3 === 0 && at2 >= 4) return 'generalist';
  return at2plus >= 2 ? 'generalist' : 'learning';
}

/** Mismos umbrales que el informe mensual del equipo para que ambas herramientas coincidan. */
export function classifyContribution(a: ProfileActivity): ProfileContribution {
  const months = Math.max(1, a.monthsActive);
  const prsPerMonth = a.mergedPrs / months;
  const reviewsPerMonth = a.reviewsGiven / months;
  const reviewsPerOwnPr = a.reviewsGiven / Math.max(1, a.mergedPrs);
  if (a.mergedPrs <= 3 && a.monthsActive >= 3 && prsPerMonth < 1) return 'occasional';
  if (reviewsPerOwnPr >= 2 && reviewsPerMonth >= 4) return 'guardian';
  if (reviewsPerOwnPr < 0.8 && prsPerMonth >= 3) return 'builder';
  if (prsPerMonth >= 1.5) return 'balanced';
  return 'low';
}

/** Número inicial de una evidencia tipo '63 PRs mergeados, 156 reviews'; 0 si no hay. */
export function leadingCount(evidence: string | null | undefined): number {
  const m = /^\s*(\d+)/.exec(evidence ?? '');
  return m ? Number(m[1]) : 0;
}

function isRepoSkill(s: SkillDto): boolean {
  return s.category === 'domain' && !s.name.includes(' · ');
}

export function buildPersonProfile(input: ProfileInput): PersonProfile {
  const { person, skills, teamRows, activity } = input;
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const levelBySkill = new Map<number, { level: number; evidence: string | null }>();
  for (const r of input.rows) {
    if (skillById.has(r.skillId)) levelBySkill.set(r.skillId, { level: r.level, evidence: r.evidence });
  }
  const levelOfId = (id: number) => levelBySkill.get(id)?.level ?? 0;
  const item = (s: SkillDto) => ({ skillId: s.id, name: s.name, level: levelOfId(s.id), evidence: levelBySkill.get(s.id)?.evidence ?? null });

  const shape = classifyShape([...levelBySkill.values()].map((v) => v.level));
  const contribution = classifyContribution(activity);

  // Otros activos: cualquier persona distinta con filas en la matriz del equipo.
  const otherIds = new Set(teamRows.map((r) => r.personId).filter((id) => id !== person.id));
  const othersAt2plus = (skillId: number) =>
    new Set(teamRows.filter((r) => r.skillId === skillId && r.personId !== person.id && r.level >= 2).map((r) => r.personId)).size;

  const referentSkills = skills.filter((s) => levelOfId(s.id) === 3);
  const referentIn = referentSkills.map(item);
  const soleReferentIn = referentSkills.filter((s) => othersAt2plus(s.id) === 0).map(item);

  const domainTop = skills
    .filter((s) => s.category === 'domain' && levelOfId(s.id) >= 2)
    .map(item)
    .sort((a, b) => b.level - a.level || leadingCount(b.evidence) - leadingCount(a.evidence))
    .slice(0, 6);

  const gaps = skills
    .filter((s) => s.category !== 'domain' && levelOfId(s.id) <= 1 && otherIds.size > 0 && othersAt2plus(s.id) * 2 >= otherIds.size)
    .map((s) => ({ skillId: s.id, name: s.name, level: levelOfId(s.id) }))
    .slice(0, 5);

  const levelOfName = (name: string) => {
    const needle = name.toLowerCase();
    const s = skills.find((x) => x.name.toLowerCase().startsWith(needle));
    return s ? levelOfId(s.id) : 0;
  };
  const roleCtx: RoleContext = {
    repoSkillsAt3: skills.filter((s) => isRepoSkill(s) && levelOfId(s.id) === 3).length,
    stackSkillsAt2plus: skills.filter((s) => s.category === 'stack' && levelOfId(s.id) >= 2).length,
  };
  const suggestedRole = ROLE_RULES.find((r) => r.test(levelOfName, roleCtx))?.role ?? null;
  const role = person.role ?? suggestedRole;
  const roleSource = person.role ? 'manual' : suggestedRole ? 'suggested' : null;

  const soleIds = new Set(soleReferentIn.map((r) => r.skillId));
  const autonomousDomains = skills.filter((s) => s.category === 'domain' && levelOfId(s.id) === 2).length;
  const clauses: string[] = [];
  if (referentIn.length > 0) {
    const names = referentIn.map((r) => (soleIds.has(r.skillId) ? `${r.name} (único)` : r.name)).join(', ');
    clauses.push(`Referente en ${names}${autonomousDomains > 0 ? `; autónomo en ${autonomousDomains} repos/épicas más` : ''}.`);
  } else if (autonomousDomains > 0) {
    clauses.push(`Autónomo en ${autonomousDomains} repos/épicas.`);
  }
  if (gaps.length > 0) clauses.push(`Hueco: ${gaps.map((g) => g.name).join(', ')}.`);
  const head = `${person.name} · ${person.seniority ?? 'sin seniority'} · ${SHAPE_LABEL[shape]} · ${CONTRIBUTION_LABEL[contribution]}.`;
  const summary = [head, ...clauses].join(' ');

  return { personId: person.id, shape, contribution, suggestedRole, role, roleSource, referentIn, soleReferentIn, domainTop, gaps, summary };
}

/** Meses (de 30 días, redondeados) entre `from` y `now`; mínimo 1. */
export function monthsBetween(from: Date | null, now: Date): number {
  if (!from) return 1;
  const months = Math.round((now.getTime() - from.getTime()) / (30 * 24 * 3600 * 1000));
  return Math.max(1, months);
}

export interface PersonActivityRow {
  personId: number;
  mergedPrs: number;
  reviewsGiven: number;
  firstActivityAt: Date | null;
}

/** Agrega la actividad bruta por persona (PRs mergeados, reviews, primera fecha), ordenada por id. */
export function personActivityFromSnapshot(snapshot: Pick<ActivitySnapshot, 'prs' | 'reviews'>): PersonActivityRow[] {
  const acc = new Map<number, PersonActivityRow>();
  const get = (id: number) => {
    let row = acc.get(id);
    if (!row) {
      row = { personId: id, mergedPrs: 0, reviewsGiven: 0, firstActivityAt: null };
      acc.set(id, row);
    }
    return row;
  };
  const earliest = (row: PersonActivityRow, at: Date | null) => {
    if (at && (!row.firstActivityAt || at < row.firstActivityAt)) row.firstActivityAt = at;
  };
  for (const pr of snapshot.prs) {
    if (pr.authorPersonId === null) continue;
    const row = get(pr.authorPersonId);
    row.mergedPrs += 1;
    earliest(row, pr.mergedAt);
  }
  for (const rv of snapshot.reviews) {
    if (rv.reviewerPersonId === null) continue;
    const row = get(rv.reviewerPersonId);
    row.reviewsGiven += 1;
    earliest(row, rv.submittedAt);
  }
  return [...acc.values()].sort((a, b) => a.personId - b.personId);
}
