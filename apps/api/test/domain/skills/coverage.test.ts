import { describe, it, expect } from 'vitest';
import { coverage, soleOwnerSkills, planAutoUpserts } from '../../../src/domain/skills/coverage.js';

const people = [
  { id: 1, active: true },
  { id: 2, active: true },
  { id: 3, active: true },
  { id: 4, active: false },
];

describe('coverage', () => {
  it('cuenta ≥2 y 3 solo entre personas activas y clasifica el riesgo', () => {
    const rows = [
      { personId: 1, skillId: 10, level: 3 },
      { personId: 2, skillId: 10, level: 2 },
      { personId: 3, skillId: 10, level: 2 },
      { personId: 4, skillId: 10, level: 3 }, // inactiva: no cuenta
      { personId: 1, skillId: 20, level: 2 },
      { personId: 2, skillId: 20, level: 2 },
      { personId: 1, skillId: 30, level: 3 },
      { personId: 2, skillId: 30, level: 1 },
    ];
    const out = coverage({ skillIds: [10, 20, 30, 40], people, rows });
    expect(out).toEqual([
      { skillId: 10, count2plus: 3, count3: 1, busFactor: 3, risk: 'green' },
      { skillId: 20, count2plus: 2, count3: 0, busFactor: 2, risk: 'amber' },
      { skillId: 30, count2plus: 1, count3: 1, busFactor: 1, risk: 'red' },
      { skillId: 40, count2plus: 0, count3: 0, busFactor: 0, risk: 'red' },
    ]);
  });
});

describe('soleOwnerSkills', () => {
  it('devuelve las skills en las que la persona es la única con nivel ≥ 2', () => {
    const rows = [
      { personId: 1, skillId: 10, level: 3 },
      { personId: 2, skillId: 10, level: 1 },
      { personId: 1, skillId: 20, level: 2 },
      { personId: 2, skillId: 20, level: 2 },
      { personId: 1, skillId: 30, level: 1 },
    ];
    expect(soleOwnerSkills(1, { people, rows })).toEqual([10]);
    expect(soleOwnerSkills(2, { people, rows })).toEqual([]);
  });
});

describe('planAutoUpserts', () => {
  it('las filas manuales ganan siempre: no se sobreescriben', () => {
    const existing = [
      { personId: 1, skillId: 10, source: 'manual' as const },
      { personId: 1, skillId: 20, source: 'auto' as const },
    ];
    const suggestions = [
      { personId: 1, skillId: 10, level: 3, evidence: 'x' },
      { personId: 1, skillId: 20, level: 1, evidence: 'y' },
      { personId: 2, skillId: 10, level: 2, evidence: 'z' },
    ];
    expect(planAutoUpserts(existing, suggestions)).toEqual([
      { personId: 1, skillId: 20, level: 1, evidence: 'y' },
      { personId: 2, skillId: 10, level: 2, evidence: 'z' },
    ]);
  });
});
