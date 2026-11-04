/**
 * Casos de uso del mapa de skills: lectura de la matriz con cobertura, detalle por persona y
 * recálculo automático de skills de dominio (repos / épicas) a partir de la actividad del
 * último año. El recálculo se expone vía `POST /api/skills/recompute` y se engancha al final
 * de cada sync.
 */
import type { PersonSkillsResponse, RecomputeSkillsResponse, SkillsResponse } from '@devboard/shared';
import { coverage, planAutoUpserts, soleOwnerSkills } from '../../domain/skills/coverage.js';
import { epicSkillName, suggestDomainLevels } from '../../domain/skills/suggest.js';
import { slugify } from '../../domain/metrics/time.js';
import { DrizzleSkillsRepo, type PersonSkillRow, type SkillsRepo } from './skills.repo.js';

const WINDOW_DAYS = 365;

function toDto(r: PersonSkillRow) {
  return { personId: r.personId, skillId: r.skillId, level: r.level as 0 | 1 | 2 | 3, source: r.source, evidence: r.evidence };
}

export class SkillsService {
  constructor(private readonly repo: SkillsRepo = new DrizzleSkillsRepo()) {}

  async matrix(): Promise<SkillsResponse> {
    const [allSkills, allPeople, rows] = await Promise.all([this.repo.listSkills(), this.repo.listPeople(), this.repo.listPersonSkills()]);
    const activeSkills = allSkills.filter((s) => s.active);
    const activePeople = allPeople.filter((p) => p.active);
    const skillIds = new Set(activeSkills.map((s) => s.id));
    const personIds = new Set(activePeople.map((p) => p.id));
    const visible = rows.filter((r) => skillIds.has(r.skillId) && personIds.has(r.personId));
    return {
      skills: activeSkills,
      people: activePeople.map((p) => ({ id: p.id, name: p.name, seniority: p.seniority })),
      matrix: visible.map(toDto),
      coverage: coverage({ skillIds: activeSkills.map((s) => s.id), people: allPeople, rows }),
    };
  }

  /** Detalle por slug (mismo `slugify(name)` que `/api/team/:slug`); `null` si no existe. */
  async person(slug: string): Promise<PersonSkillsResponse | null> {
    const [allSkills, allPeople, rows] = await Promise.all([this.repo.listSkills(), this.repo.listPeople(), this.repo.listPersonSkills()]);
    const person = allPeople.find((p) => slugify(p.name) === slug);
    if (!person) return null;
    const activeSkillIds = new Set(allSkills.filter((s) => s.active).map((s) => s.id));
    const activeRows = rows.filter((r) => activeSkillIds.has(r.skillId));
    return {
      person: { id: person.id, name: person.name, seniority: person.seniority },
      skills: allSkills.filter((s) => s.active),
      rows: activeRows.filter((r) => r.personId === person.id).map(toDto),
      soleOwnerOf: soleOwnerSkills(person.id, { people: allPeople, rows: activeRows }),
    };
  }

  /** Crea skills de dominio nuevas y escribe las sugerencias `auto` sin pisar filas `manual`. */
  async recompute(now: Date = new Date()): Promise<RecomputeSkillsResponse> {
    const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 3600 * 1000);
    const activity = await this.repo.activitySince(since);

    const epicSummary = new Map(activity.epics.map((e) => [e.key, e.summary]));
    const repoNames = [...new Set(activity.prs.map((p) => p.repo))];
    const epicKeys = [...new Set(activity.epicAssignments.map((a) => a.epicKey))];
    const nameForEpic = (key: string) => epicSkillName(key, epicSummary.get(key) ?? key);
    const domainSkillsCreated = await this.repo.ensureDomainSkills([...repoNames, ...epicKeys.map(nameForEpic)]);

    const suggestions = suggestDomainLevels({ ...activity, since, now });
    const skillIdByName = new Map((await this.repo.listSkills()).map((s) => [s.name, s.id]));
    const candidates = suggestions.flatMap((s) => {
      const skillId = skillIdByName.get(s.kind === 'repo' ? s.key : nameForEpic(s.key));
      return skillId === undefined ? [] : [{ personId: s.personId, skillId, level: s.level, evidence: s.evidence }];
    });
    const existing = await this.repo.listPersonSkills();
    const rowsUpserted = await this.repo.upsertAuto(planAutoUpserts(existing, candidates));
    return { domainSkillsCreated, rowsUpserted };
  }
}
