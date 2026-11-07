/**
 * Casos de uso del mapa de skills: lectura de la matriz con cobertura, detalle por persona y
 * recálculo automático de skills de dominio (repos / épicas) a partir de la actividad del
 * último año. El recálculo se expone vía `POST /api/skills/recompute` y se engancha al final
 * de cada sync.
 */
import type { PersonProfileDto, PersonSkillsResponse, RecomputeSkillsResponse, SkillsResponse } from '@teampulse/shared';
import { coverage, planAutoUpserts, soleOwnerSkills } from '../../domain/skills/coverage.js';
import { buildPersonProfile, monthsBetween, type PersonActivityRow } from '../../domain/skills/profile.js';
import { epicSkillName, suggestDomainLevels } from '../../domain/skills/suggest.js';
import { slugify } from '../../domain/metrics/time.js';
import { DrizzleSkillsRepo, type PersonRow, type PersonSkillRow, type SkillRow, type SkillsRepo } from './skills.repo.js';

const WINDOW_DAYS = 365;

function toDto(r: PersonSkillRow) {
  return { personId: r.personId, skillId: r.skillId, level: r.level as 0 | 1 | 2 | 3, source: r.source, evidence: r.evidence };
}

function toPersonDto(p: PersonRow) {
  return { id: p.id, name: p.name, seniority: p.seniority, role: p.role };
}

function windowStart(now: Date): Date {
  return new Date(now.getTime() - WINDOW_DAYS * 24 * 3600 * 1000);
}

export class SkillsService {
  constructor(private readonly repo: SkillsRepo = new DrizzleSkillsRepo()) {}

  /** Perfil derivado de una persona a partir de la matriz visible (skills y personas activas). */
  private profileFor(person: PersonRow, activeSkills: SkillRow[], visible: PersonSkillRow[], activity: PersonActivityRow[], now: Date): PersonProfileDto {
    const own = activity.find((a) => a.personId === person.id);
    return buildPersonProfile({
      person: toPersonDto(person),
      skills: activeSkills,
      rows: visible.filter((r) => r.personId === person.id).map(toDto),
      teamRows: visible.map(toDto),
      activity: {
        mergedPrs: own?.mergedPrs ?? 0,
        reviewsGiven: own?.reviewsGiven ?? 0,
        monthsActive: monthsBetween(own?.firstActivityAt ?? null, now),
      },
    });
  }

  async matrix(now: Date = new Date()): Promise<SkillsResponse> {
    const [allSkills, allPeople, rows, activity] = await Promise.all([
      this.repo.listSkills(),
      this.repo.listPeople(),
      this.repo.listPersonSkills(),
      this.repo.personActivity(windowStart(now)),
    ]);
    const activeSkills = allSkills.filter((s) => s.active);
    const activePeople = allPeople.filter((p) => p.active);
    const skillIds = new Set(activeSkills.map((s) => s.id));
    const personIds = new Set(activePeople.map((p) => p.id));
    const visible = rows.filter((r) => skillIds.has(r.skillId) && personIds.has(r.personId));
    return {
      skills: activeSkills,
      people: activePeople.map(toPersonDto),
      matrix: visible.map(toDto),
      coverage: coverage({ skillIds: activeSkills.map((s) => s.id), people: allPeople, rows }),
      profiles: activePeople.map((p) => {
        const { personId, shape, contribution, role, roleSource, summary } = this.profileFor(p, activeSkills, visible, activity, now);
        return { personId, shape, contribution, role, roleSource, summary };
      }),
    };
  }

  /** Detalle por slug (mismo `slugify(name)` que `/api/team/:slug`); `null` si no existe. */
  async person(slug: string, now: Date = new Date()): Promise<PersonSkillsResponse | null> {
    const [allSkills, allPeople, rows] = await Promise.all([this.repo.listSkills(), this.repo.listPeople(), this.repo.listPersonSkills()]);
    const person = allPeople.find((p) => slugify(p.name) === slug);
    if (!person) return null;
    const activeSkills = allSkills.filter((s) => s.active);
    const activeSkillIds = new Set(activeSkills.map((s) => s.id));
    const activeRows = rows.filter((r) => activeSkillIds.has(r.skillId));
    const activePersonIds = new Set(allPeople.filter((p) => p.active).map((p) => p.id));
    // Para el perfil comparamos solo con personas activas, pero la propia persona siempre entra.
    const teamRows = activeRows.filter((r) => activePersonIds.has(r.personId) || r.personId === person.id);
    const activity = await this.repo.personActivity(windowStart(now));
    return {
      person: toPersonDto(person),
      skills: activeSkills,
      rows: activeRows.filter((r) => r.personId === person.id).map(toDto),
      soleOwnerOf: soleOwnerSkills(person.id, { people: allPeople, rows: activeRows }),
      profile: this.profileFor(person, activeSkills, teamRows, activity, now),
    };
  }

  /** Crea skills de dominio nuevas y escribe las sugerencias `auto` sin pisar filas `manual`. */
  async recompute(now: Date = new Date()): Promise<RecomputeSkillsResponse> {
    const since = windowStart(now);
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
