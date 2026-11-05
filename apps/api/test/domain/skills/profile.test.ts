import { describe, it, expect } from 'vitest';
import { buildPersonProfile, monthsBetween, personActivityFromSnapshot, type ProfileInput } from '../../../src/domain/skills/profile.js';
import type { PersonSkillDto, SkillDto } from '@devboard/shared';

const skill = (id: number, name: string, category: SkillDto['category']): SkillDto => ({
  id,
  name,
  category,
  description: null,
  sortOrder: id,
  active: true,
});

// Catálogo: 4 competencias, 4 stack, 4 dominio (3 repos + 1 épica).
const skills: SkillDto[] = [
  skill(1, 'Ejecución técnica', 'competency'),
  skill(2, 'Calidad y review', 'competency'),
  skill(3, 'Colaboración y mentoría', 'competency'),
  skill(4, 'Testing (unit + integración)', 'competency'),
  skill(5, 'Node/TypeScript', 'stack'),
  skill(6, 'SST / IaC', 'stack'),
  skill(7, 'AWS Lambda / serverless', 'stack'),
  skill(8, 'CI/CD', 'stack'),
  skill(9, 'org/api', 'domain'),
  skill(10, 'org/web', 'domain'),
  skill(11, 'org/infra', 'domain'),
  skill(12, 'DEV-1 · Pagos', 'domain'),
];

const row = (personId: number, skillId: number, level: 0 | 1 | 2 | 3, evidence: string | null = null): PersonSkillDto => ({
  personId,
  skillId,
  level,
  source: 'manual',
  evidence,
});

const rowsFor = (personId: number, levels: Record<number, 0 | 1 | 2 | 3>, evidence: Record<number, string> = {}) =>
  Object.entries(levels).map(([skillId, level]) => row(personId, Number(skillId), level, evidence[Number(skillId)] ?? null));

const ana = { id: 1, name: 'Ana Pérez', seniority: 'senior' as const, role: null };
const activity = { mergedPrs: 10, reviewsGiven: 10, monthsActive: 5 };

function build(partial: Partial<ProfileInput>) {
  const rows = partial.rows ?? [];
  return buildPersonProfile({ person: ana, skills, rows, teamRows: rows, activity, ...partial });
}

describe('buildPersonProfile · shape', () => {
  it('specialist: exactamente 1 skill a nivel 3 y ≤2 a nivel 2', () => {
    expect(build({ rows: rowsFor(1, { 1: 3, 5: 2, 9: 2 }) }).shape).toBe('specialist');
  });
  it('t-shaped: ≥1 a nivel 3 y ≥3 a nivel 2', () => {
    expect(build({ rows: rowsFor(1, { 1: 3, 5: 2, 6: 2, 9: 2 }) }).shape).toBe('t-shaped');
  });
  it('generalist: 0 a nivel 3 y ≥4 a nivel 2', () => {
    expect(build({ rows: rowsFor(1, { 1: 2, 5: 2, 6: 2, 9: 2 }) }).shape).toBe('generalist');
  });
  it('learning: menos de 2 skills con nivel ≥2', () => {
    expect(build({ rows: rowsFor(1, { 1: 1, 5: 1, 9: 2 }) }).shape).toBe('learning');
    expect(build({ rows: [] }).shape).toBe('learning');
  });
  it('sin regla exacta cae en generalist si hay ≥2 skills con nivel ≥2', () => {
    expect(build({ rows: rowsFor(1, { 1: 3, 5: 3 }) }).shape).toBe('generalist');
  });
  it('ignora filas de skills que no están en el catálogo activo', () => {
    expect(build({ rows: [...rowsFor(1, { 1: 3 }), row(1, 999, 3)] }).shape).toBe('learning');
  });
});

describe('buildPersonProfile · contribution', () => {
  const rows = rowsFor(1, { 1: 2 });
  it('occasional: ≤3 PRs en ≥3 meses y <1 PR/mes', () => {
    expect(build({ rows, activity: { mergedPrs: 2, reviewsGiven: 20, monthsActive: 6 } }).contribution).toBe('occasional');
  });
  it('guardian: ≥2 reviews por PR propio y ≥4 reviews/mes', () => {
    expect(build({ rows, activity: { mergedPrs: 5, reviewsGiven: 20, monthsActive: 4 } }).contribution).toBe('guardian');
  });
  it('builder: <0.8 reviews por PR y ≥3 PRs/mes', () => {
    expect(build({ rows, activity: { mergedPrs: 30, reviewsGiven: 5, monthsActive: 5 } }).contribution).toBe('builder');
  });
  it('balanced: ≥1.5 PRs/mes', () => {
    expect(build({ rows, activity: { mergedPrs: 10, reviewsGiven: 10, monthsActive: 5 } }).contribution).toBe('balanced');
  });
  it('low: el resto', () => {
    expect(build({ rows, activity: { mergedPrs: 4, reviewsGiven: 2, monthsActive: 4 } }).contribution).toBe('low');
  });
  it('monthsActive 0 cuenta como 1 (sin división por cero)', () => {
    expect(build({ rows, activity: { mergedPrs: 2, reviewsGiven: 0, monthsActive: 0 } }).contribution).toBe('balanced');
  });
});

describe('buildPersonProfile · referentes, dominio y huecos', () => {
  it('referentIn = nivel 3; soleReferentIn = nadie más activo con ≥2', () => {
    const rows = rowsFor(1, { 1: 3, 5: 3, 9: 2 });
    const teamRows = [...rows, ...rowsFor(2, { 1: 2, 5: 1 })];
    const p = build({ rows, teamRows });
    expect(p.referentIn.map((r) => r.skillId)).toEqual([1, 5]);
    expect(p.soleReferentIn).toEqual([{ skillId: 5, name: 'Node/TypeScript', level: 3, evidence: null }]);
  });

  it('domainTop ordena por nivel y PRs de la evidencia, máximo 6', () => {
    const rows = rowsFor(1, { 9: 2, 10: 3, 11: 2, 12: 1 }, { 9: '63 PRs mergeados, 156 reviews', 11: '7 PRs mergeados, 2 reviews' });
    const p = build({ rows });
    expect(p.domainTop.map((d) => d.skillId)).toEqual([10, 9, 11]);
    expect(p.domainTop[1]).toEqual({ skillId: 9, name: 'org/api', level: 2, evidence: '63 PRs mergeados, 156 reviews' });
  });

  it('gaps: competencias/stack donde la persona está ≤1 y al menos la mitad de los demás ≥2 (máx 5)', () => {
    const rows = rowsFor(1, { 1: 1, 5: 0 });
    const teamRows = [
      ...rows,
      ...rowsFor(2, { 1: 2, 5: 2, 6: 3, 9: 3 }),
      ...rowsFor(3, { 1: 2, 5: 1, 6: 2 }),
      ...rowsFor(4, { 1: 1, 5: 1, 6: 1 }),
    ];
    const p = build({ rows, teamRows });
    // skill 1: 2 de 3 ≥2 → hueco; skill 5: 1 de 3 → no; skill 6: 2 de 3 → hueco (nivel 0 sin fila); skill 9 es dominio → no.
    expect(p.gaps).toEqual([
      { skillId: 1, name: 'Ejecución técnica', level: 1 },
      { skillId: 6, name: 'SST / IaC', level: 0 },
    ]);
  });

  it('sin otras personas activas no hay huecos', () => {
    expect(build({ rows: rowsFor(1, { 1: 1 }) }).gaps).toEqual([]);
  });
});

describe('buildPersonProfile · rol', () => {
  it('Platform / Infra tiene prioridad sobre Quality champion y Mentor', () => {
    const p = build({ rows: rowsFor(1, { 2: 3, 3: 3, 4: 2, 6: 2, 7: 2, 8: 3 }) });
    expect(p.suggestedRole).toBe('Platform / Infra');
    expect(p.role).toBe('Platform / Infra');
    expect(p.roleSource).toBe('suggested');
  });
  it('Quality champion antes que Mentor; Mentor antes que Backend owner; Backend owner antes que Backend', () => {
    expect(build({ rows: rowsFor(1, { 2: 3, 4: 2, 3: 3 }) }).suggestedRole).toBe('Quality champion');
    expect(build({ rows: rowsFor(1, { 3: 3, 9: 3, 10: 3 }) }).suggestedRole).toBe('Mentor');
    expect(build({ rows: rowsFor(1, { 9: 3, 10: 3, 12: 3, 5: 2, 6: 2, 7: 2 }) }).suggestedRole).toBe('Backend owner');
    expect(build({ rows: rowsFor(1, { 9: 3, 12: 3, 5: 2, 6: 2, 7: 2 }) }).suggestedRole).toBe('Backend'); // la épica no cuenta como repo
  });
  it('sin regla → null y roleSource null', () => {
    const p = build({ rows: rowsFor(1, { 1: 2 }) });
    expect(p.suggestedRole).toBeNull();
    expect(p.role).toBeNull();
    expect(p.roleSource).toBeNull();
  });
  it('el rol manual gana a la sugerencia', () => {
    const p = build({ person: { ...ana, role: 'Tech lead' }, rows: rowsFor(1, { 3: 3 }) });
    expect(p.suggestedRole).toBe('Mentor');
    expect(p.role).toBe('Tech lead');
    expect(p.roleSource).toBe('manual');
  });
  it('matching de nombres por prefijo e insensible a mayúsculas', () => {
    const renamed = skills.map((s) => (s.id === 3 ? { ...s, name: 'colaboración y mentoría (equipo)' } : s));
    expect(build({ skills: renamed, rows: rowsFor(1, { 3: 3 }) }).suggestedRole).toBe('Mentor');
  });
});

describe('buildPersonProfile · summary', () => {
  it('frase completa con referentes (único), autonomía y huecos', () => {
    const rows = rowsFor(1, { 1: 3, 5: 3, 9: 2, 10: 2, 11: 2 });
    const teamRows = [...rows, ...rowsFor(2, { 1: 2, 5: 1, 6: 2 }), ...rowsFor(3, { 6: 2 })];
    const p = build({ rows, teamRows, activity: { mergedPrs: 5, reviewsGiven: 20, monthsActive: 4 } });
    expect(p.summary).toBe(
      'Ana Pérez · senior · T-shaped · Guardián (revisa más de lo que escribe). Referente en Ejecución técnica, Node/TypeScript (único); autónomo en 3 repos/épicas más. Hueco: SST / IaC.',
    );
  });
  it('omite las cláusulas vacías', () => {
    const p = build({ person: { ...ana, seniority: null }, rows: rowsFor(1, { 1: 1 }), activity: { mergedPrs: 4, reviewsGiven: 2, monthsActive: 4 } });
    expect(p.summary).toBe('Ana Pérez · sin seniority · En formación · Baja actividad en código.');
  });
});

describe('personActivityFromSnapshot / monthsBetween', () => {
  it('agrega PRs y reviews por persona con la primera fecha de actividad', () => {
    const d1 = new Date('2026-01-10T00:00:00Z');
    const d2 = new Date('2026-03-10T00:00:00Z');
    const out = personActivityFromSnapshot({
      prs: [
        { repo: 'a', authorPersonId: 1, mergedAt: d2 },
        { repo: 'a', authorPersonId: 1, mergedAt: d1 },
        { repo: 'a', authorPersonId: null, mergedAt: d1 },
      ],
      reviews: [{ repo: 'a', reviewerPersonId: 2, submittedAt: d2 }],
      epicAssignments: [],
      epics: [],
    });
    expect(out).toEqual([
      { personId: 1, mergedPrs: 2, reviewsGiven: 0, firstActivityAt: d1 },
      { personId: 2, mergedPrs: 0, reviewsGiven: 1, firstActivityAt: d2 },
    ]);
  });
  it('monthsBetween redondea a meses de 30 días con mínimo 1', () => {
    expect(monthsBetween(new Date('2026-01-01'), new Date('2026-01-05'))).toBe(1);
    expect(monthsBetween(new Date('2026-01-01'), new Date('2026-07-01'))).toBe(6);
    expect(monthsBetween(null, new Date('2026-07-01'))).toBe(1);
  });
});
