/**
 * Acceso a `skills`, `person_skills` y `people.seniority`, desacoplado de drizzle para poder
 * probar los controladores con una implementación en memoria (ver test/fixtures).
 */
import { and, asc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import type { Seniority, SkillCategory, SkillSource } from '@devboard/shared';
import { getDb } from '../../db/client.js';
import { epics, issues, people, personSkills, prReviews, pullRequests, skills } from '../../db/schema.js';
import { personActivityFromSnapshot, type PersonActivityRow } from '../../domain/skills/profile.js';

export type { PersonActivityRow };

export interface SkillRow {
  id: number;
  name: string;
  category: SkillCategory;
  description: string | null;
  sortOrder: number;
  active: boolean;
}

export interface PersonRow {
  id: number;
  name: string;
  active: boolean;
  seniority: Seniority | null;
  role: string | null;
}

export interface PersonSkillRow {
  personId: number;
  skillId: number;
  level: number;
  source: SkillSource;
  evidence: string | null;
  updatedAt: Date;
}

export interface UpsertAutoRow {
  personId: number;
  skillId: number;
  level: number;
  evidence: string | null;
}

/** Actividad bruta (ventana temporal) con la que se sugieren niveles de dominio. */
export interface ActivitySnapshot {
  prs: Array<{ repo: string; authorPersonId: number | null; mergedAt: Date | null }>;
  reviews: Array<{ repo: string; reviewerPersonId: number | null; submittedAt: Date | null }>;
  epicAssignments: Array<{ epicKey: string; personId: number | null; at: Date | null }>;
  /** Épicas conocidas (para nombrar la skill `KEY · summary`). */
  epics: Array<{ key: string; summary: string }>;
}

export interface SkillsRepo {
  listSkills(): Promise<SkillRow[]>;
  /** `null` si el nombre ya existe (índice único). */
  createSkill(input: { name: string; category: SkillCategory; description: string | null; sortOrder: number }): Promise<SkillRow | null>;
  updateSkill(id: number, patch: Partial<Omit<SkillRow, 'id' | 'category'>>): Promise<SkillRow | null>;
  /** Crea skills `domain` con esos nombres si no existen; devuelve cuántas creó. */
  ensureDomainSkills(names: string[]): Promise<number>;

  listPeople(): Promise<PersonRow[]>;
  setSeniority(personId: number, seniority: Seniority | null): Promise<PersonRow | null>;
  setRole(personId: number, role: string | null): Promise<PersonRow | null>;

  listPersonSkills(): Promise<PersonSkillRow[]>;
  /** Upsert `manual`; `null` si la persona o la skill no existen. */
  upsertManual(personId: number, skillId: number, level: number, evidence: string | null): Promise<PersonSkillRow | null>;
  deleteRow(personId: number, skillId: number): Promise<boolean>;
  /** Upsert `auto` que nunca pisa filas `manual`; devuelve cuántas filas escribió. */
  upsertAuto(rows: UpsertAutoRow[]): Promise<number>;

  activitySince(since: Date): Promise<ActivitySnapshot>;
  /** PRs mergeados y reviews por persona desde `since`, con la primera fecha de actividad. */
  personActivity(since: Date): Promise<PersonActivityRow[]>;
}

function toSkill(r: typeof skills.$inferSelect): SkillRow {
  return { id: r.id, name: r.name, category: r.category as SkillCategory, description: r.description, sortOrder: r.sortOrder, active: r.active };
}

function toPerson(r: typeof people.$inferSelect): PersonRow {
  return { id: r.id, name: r.name, active: r.active, seniority: (r.seniority as Seniority | null) ?? null, role: r.role ?? null };
}

function toRow(r: typeof personSkills.$inferSelect): PersonSkillRow {
  return { personId: r.personId, skillId: r.skillId, level: r.level, source: r.source as SkillSource, evidence: r.evidence, updatedAt: r.updatedAt };
}

export class DrizzleSkillsRepo implements SkillsRepo {
  async listSkills(): Promise<SkillRow[]> {
    const rows = await getDb().select().from(skills).orderBy(
        // Orden determinista: categoría (competency, stack, domain), sort_order e id
        sql`case ${skills.category} when 'competency' then 0 when 'stack' then 1 else 2 end`,
        asc(skills.sortOrder),
        asc(skills.id),
      );
    return rows.map(toSkill);
  }

  async createSkill(input: { name: string; category: SkillCategory; description: string | null; sortOrder: number }): Promise<SkillRow | null> {
    const [row] = await getDb().insert(skills).values(input).onConflictDoNothing({ target: skills.name }).returning();
    return row ? toSkill(row) : null;
  }

  async updateSkill(id: number, patch: Partial<Omit<SkillRow, 'id' | 'category'>>): Promise<SkillRow | null> {
    const [row] = await getDb().update(skills).set(patch).where(eq(skills.id, id)).returning();
    return row ? toSkill(row) : null;
  }

  async ensureDomainSkills(names: string[]): Promise<number> {
    if (names.length === 0) return 0;
    const inserted = await getDb()
      .insert(skills)
      .values(names.map((name) => ({ name, category: 'domain' as const, description: null, sortOrder: 0 })))
      .onConflictDoNothing({ target: skills.name })
      .returning({ id: skills.id });
    return inserted.length;
  }

  async listPeople(): Promise<PersonRow[]> {
    const rows = await getDb().select().from(people).orderBy(asc(people.name));
    return rows.map(toPerson);
  }

  async setSeniority(personId: number, seniority: Seniority | null): Promise<PersonRow | null> {
    const [row] = await getDb().update(people).set({ seniority }).where(eq(people.id, personId)).returning();
    return row ? toPerson(row) : null;
  }

  async setRole(personId: number, role: string | null): Promise<PersonRow | null> {
    const [row] = await getDb().update(people).set({ role }).where(eq(people.id, personId)).returning();
    return row ? toPerson(row) : null;
  }

  async listPersonSkills(): Promise<PersonSkillRow[]> {
    const rows = await getDb().select().from(personSkills);
    return rows.map(toRow);
  }

  async upsertManual(personId: number, skillId: number, level: number, evidence: string | null): Promise<PersonSkillRow | null> {
    const db = getDb();
    const [person, skill] = await Promise.all([
      db.select({ id: people.id }).from(people).where(eq(people.id, personId)).limit(1),
      db.select({ id: skills.id }).from(skills).where(eq(skills.id, skillId)).limit(1),
    ]);
    if (person.length === 0 || skill.length === 0) return null;
    const [row] = await db
      .insert(personSkills)
      .values({ personId, skillId, level, source: 'manual', evidence, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [personSkills.personId, personSkills.skillId],
        set: { level, source: 'manual', evidence, updatedAt: new Date() },
      })
      .returning();
    return row ? toRow(row) : null;
  }

  async deleteRow(personId: number, skillId: number): Promise<boolean> {
    const deleted = await getDb()
      .delete(personSkills)
      .where(and(eq(personSkills.personId, personId), eq(personSkills.skillId, skillId)))
      .returning({ personId: personSkills.personId });
    return deleted.length > 0;
  }

  async upsertAuto(rows: UpsertAutoRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    // `WHERE person_skills.source = 'auto'` en el conflicto: las filas manuales no se tocan.
    const written = await getDb()
      .insert(personSkills)
      .values(rows.map((r) => ({ ...r, source: 'auto' as const, updatedAt: new Date() })))
      .onConflictDoUpdate({
        target: [personSkills.personId, personSkills.skillId],
        set: {
          level: sql`excluded.level`,
          evidence: sql`excluded.evidence`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${personSkills.source} = 'auto'`,
      })
      .returning({ personId: personSkills.personId });
    return written.length;
  }

  /**
   * El sync no rellena las columnas `*_person_id`: la canonización de personas se hace, como en
   * el resto de métricas, por `people.github_logins` / `people.jira_names`. Resolvemos aquí con
   * el mismo criterio y usamos la columna FK solo como respaldo.
   */
  async activitySince(since: Date): Promise<ActivitySnapshot> {
    const db = getDb();
    const personByGithub = (login: typeof pullRequests.authorLogin | typeof prReviews.reviewerLogin) =>
      sql<number | null>`(select ${people.id} from ${people} where ${login} = any(${people.githubLogins}) limit 1)`;
    const personByJira = sql<number | null>`(select ${people.id} from ${people} where ${issues.assigneeRaw} = any(${people.jiraNames}) limit 1)`;
    const [prRows, reviewRows, issueRows, epicRows] = await Promise.all([
      db
        .select({
          repo: pullRequests.repo,
          authorPersonId: sql<number | null>`coalesce(${pullRequests.authorPersonId}, ${personByGithub(pullRequests.authorLogin)})`,
          mergedAt: pullRequests.mergedAt,
        })
        .from(pullRequests)
        .where(and(isNotNull(pullRequests.mergedAt), gte(pullRequests.mergedAt, since))),
      db
        .select({
          repo: pullRequests.repo,
          reviewerPersonId: sql<number | null>`coalesce(${prReviews.reviewerPersonId}, ${personByGithub(prReviews.reviewerLogin)})`,
          submittedAt: prReviews.submittedAt,
        })
        .from(prReviews)
        .innerJoin(pullRequests, eq(prReviews.prId, pullRequests.id))
        .where(and(eq(prReviews.isBot, false), isNotNull(prReviews.submittedAt), gte(prReviews.submittedAt, since))),
      db
        .select({
          epicKey: issues.epicKey,
          personId: sql<number | null>`coalesce(${issues.personId}, ${personByJira})`,
          at: issues.updatedAt,
        })
        .from(issues)
        .where(and(isNotNull(issues.epicKey), gte(issues.updatedAt, since))),
      db.select({ key: epics.key, summary: epics.summary }).from(epics),
    ]);
    return {
      prs: prRows,
      reviews: reviewRows,
      epicAssignments: issueRows.map((i) => ({ epicKey: i.epicKey!, personId: i.personId, at: i.at })),
      epics: epicRows,
    };
  }

  /** Reutiliza `activitySince` (misma canonización de personas) en lugar de una consulta nueva. */
  async personActivity(since: Date): Promise<PersonActivityRow[]> {
    return personActivityFromSnapshot(await this.activitySince(since));
  }
}
