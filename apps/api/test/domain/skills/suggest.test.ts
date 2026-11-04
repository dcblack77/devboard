import { describe, it, expect } from 'vitest';
import { suggestDomainLevels, type SuggestInput } from '../../../src/domain/skills/suggest.js';

const NOW = new Date('2026-11-01T00:00:00Z');
const SINCE = new Date('2025-11-01T00:00:00Z');
const recent = new Date('2026-06-01T00:00:00Z');
const old = new Date('2024-01-01T00:00:00Z');

function pr(repo: string, authorPersonId: number | null, mergedAt: Date | null = recent) {
  return { repo, authorPersonId, mergedAt };
}

function base(overrides: Partial<SuggestInput> = {}): SuggestInput {
  return { prs: [], reviews: [], epicAssignments: [], since: SINCE, now: NOW, ...overrides };
}

function find(out: ReturnType<typeof suggestDomainLevels>, personId: number, kind: 'repo' | 'epic', key: string) {
  return out.find((s) => s.personId === personId && s.kind === kind && s.key === key);
}

describe('suggestDomainLevels — repos', () => {
  it('sin actividad no sugiere nada para esa persona', () => {
    const out = suggestDomainLevels(base({ prs: [pr('org/api', 1)] }));
    expect(find(out, 2, 'repo', 'org/api')).toBeUndefined();
  });

  it('1–2 PRs mergeados ⇒ nivel 1', () => {
    const out = suggestDomainLevels(base({ prs: [pr('org/api', 1), pr('org/api', 1), pr('org/api', 2), pr('org/api', 2), pr('org/api', 2), pr('org/api', 2)] }));
    expect(find(out, 1, 'repo', 'org/api')?.level).toBe(1);
  });

  it('una sola review ⇒ nivel 1', () => {
    const out = suggestDomainLevels(
      base({ prs: [pr('org/api', 2)], reviews: [{ repo: 'org/api', reviewerPersonId: 1, submittedAt: recent }] }),
    );
    expect(find(out, 1, 'repo', 'org/api')?.level).toBe(1);
  });

  it('≥3 PRs mergeados ⇒ nivel 2 (si no llega al 30 % del repo)', () => {
    const prs = [pr('org/api', 1), pr('org/api', 1), pr('org/api', 1)];
    for (let i = 0; i < 10; i++) prs.push(pr('org/api', 2));
    const out = suggestDomainLevels(base({ prs }));
    expect(find(out, 1, 'repo', 'org/api')?.level).toBe(2);
  });

  it('≥5 reviews ⇒ nivel 2 aunque no tenga PRs', () => {
    const reviews = Array.from({ length: 5 }, () => ({ repo: 'org/api', reviewerPersonId: 1, submittedAt: recent }));
    const out = suggestDomainLevels(base({ prs: [pr('org/api', 2)], reviews }));
    expect(find(out, 1, 'repo', 'org/api')?.level).toBe(2);
  });

  it('≥5 PRs y ≥30 % del repo ⇒ nivel 3 con evidencia legible', () => {
    const prs = [pr('org/api', 1), pr('org/api', 1), pr('org/api', 1), pr('org/api', 1), pr('org/api', 1), pr('org/api', 1), pr('org/api', 1)];
    for (let i = 0; i < 10; i++) prs.push(pr('org/api', 2));
    const reviews = Array.from({ length: 12 }, () => ({ repo: 'org/api', reviewerPersonId: 1, submittedAt: recent }));
    const out = suggestDomainLevels(base({ prs, reviews }));
    const s = find(out, 1, 'repo', 'org/api');
    expect(s?.level).toBe(3);
    expect(s?.evidence).toBe('7 PRs mergeados, 12 reviews, 41% del repo');
  });

  it('5 PRs que son el 100 % de un repo propio ⇒ nivel 3', () => {
    const prs = Array.from({ length: 5 }, () => pr('org/solo', 1));
    const out = suggestDomainLevels(base({ prs }));
    expect(find(out, 1, 'repo', 'org/solo')?.level).toBe(3);
  });

  it('ignora PRs anteriores a `since`, no mergeados y sin persona', () => {
    const out = suggestDomainLevels(
      base({ prs: [pr('org/api', 1, old), pr('org/api', 1, null), pr('org/api', null)] }),
    );
    expect(out).toEqual([]);
  });
});

describe('suggestDomainLevels — épicas', () => {
  it('1 issue ⇒ nivel 1; ≥3 ⇒ nivel 2; ≥5 y ≥30 % ⇒ nivel 3', () => {
    const epicAssignments = [
      { epicKey: 'E-1', personId: 1, at: recent },
      ...Array.from({ length: 3 }, () => ({ epicKey: 'E-1', personId: 2, at: recent })),
      ...Array.from({ length: 6 }, () => ({ epicKey: 'E-1', personId: 3, at: recent })),
    ];
    const out = suggestDomainLevels(base({ epicAssignments }));
    expect(find(out, 1, 'epic', 'E-1')?.level).toBe(1);
    expect(find(out, 2, 'epic', 'E-1')?.level).toBe(2);
    expect(find(out, 3, 'epic', 'E-1')?.level).toBe(3);
    expect(find(out, 3, 'epic', 'E-1')?.evidence).toBe('6 issues, 60% de la épica');
  });

  it('ignora asignaciones anteriores a `since`', () => {
    const out = suggestDomainLevels(base({ epicAssignments: [{ epicKey: 'E-1', personId: 1, at: old }] }));
    expect(out).toEqual([]);
  });
});
