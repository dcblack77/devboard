/**
 * `/api/settings`: administración (rol `tl` en toda la superficie). Cubre la fila
 * singleton `settings`, CRUD de `people` e `initiatives` (con sus épicas asociadas en
 * `initiative_epics`) y `/discover` (huecos de mapeo a partir de lo que ya hay en DB).
 *
 * Cualquier escritura (settings/people/initiatives) invalida el contexto de métricas
 * cacheado: los cambios deben reflejarse en la siguiente petición de lectura.
 */
import { controller, Get, Post, Put, Delete, body, param, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  Role,
  type CreateInitiativeRequest,
  type CreatePersonRequest,
  type DiscoverResponse,
  type InitiativeAdminDto,
  type InitiativeSource,
  type InitiativeAdminItemResponse,
  type InitiativesAdminResponse,
  type PeopleAdminResponse,
  type PersonAdminDto,
  type PersonAdminItemResponse,
  type SettingsAdminResponse,
  type UpdateInitiativeRequest,
  type UpdatePersonRequest,
  type UpdateSettingsRequest,
} from '@devboard/shared';
import { getDb } from '../../db/client.js';
import { initiativeEpics, initiatives, people, pullRequests, epics, issues, settings } from '../../db/schema.js';
import { getMetricsContext, invalidateMetricsContext } from '../../domain/context.js';
import { requireRole } from '../../middleware/auth.middleware.js';

const thresholdsSchema = z.object({
  balanceRed: z.number(),
  balanceAmber: z.number(),
  responseGreenHours: z.number(),
  responseRedHours: z.number(),
  firstReviewGreenHours: z.number(),
  firstReviewRedHours: z.number(),
  noApprovalRed: z.number(),
  stalePrsRed: z.number(),
  blockedRed: z.number(),
});

/** Validación de `PUT /api/settings`: todos los campos opcionales (actualización parcial). */
const updateSettingsSchema = z.object({
  jiraProject: z.string().nullable().optional(),
  sinceDate: z.string().nullable().optional(),
  syncMinutes: z.number().int().positive().optional(),
  attentionDays: z.number().int().positive().optional(),
  reviewDays: z.number().int().positive().optional(),
  waitReviewHours: z.number().int().positive().optional(),
  thresholds: thresholdsSchema.optional(),
  statusFlow: z.array(z.string()).optional(),
  statusAliases: z.record(z.string()).optional(),
  macroMap: z.record(z.string()).optional(),
  countedTypes: z.array(z.string()).optional(),
  hotfixRegex: z.string().nullable().optional(),
}) satisfies z.ZodType<UpdateSettingsRequest>;

const createPersonSchema = z.object({
  name: z.string().min(1),
  jiraNames: z.array(z.string()).optional(),
  githubLogins: z.array(z.string()).optional(),
  note: z.string().nullable().optional(),
  active: z.boolean().optional(),
}) satisfies z.ZodType<CreatePersonRequest>;

const updatePersonSchema = z.object({
  name: z.string().min(1).optional(),
  jiraNames: z.array(z.string()).optional(),
  githubLogins: z.array(z.string()).optional(),
  note: z.string().nullable().optional(),
  active: z.boolean().optional(),
}) satisfies z.ZodType<UpdatePersonRequest>;

const createInitiativeSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  position: z.number().int().optional(),
  epicKeys: z.array(z.string()).optional(),
}) satisfies z.ZodType<CreateInitiativeRequest>;

const updateInitiativeSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  position: z.number().int().optional(),
  epicKeys: z.array(z.string()).optional(),
}) satisfies z.ZodType<UpdateInitiativeRequest>;

function initiativeToDto(row: typeof initiatives.$inferSelect, epicKeys: string[]): InitiativeAdminDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    position: row.position,
    source: row.source as InitiativeSource,
    epicKey: row.epicKey,
    epicKeys,
  };
}

function personToDto(row: typeof people.$inferSelect): PersonAdminDto {
  return {
    id: row.id,
    name: row.name,
    jiraNames: row.jiraNames,
    githubLogins: row.githubLogins,
    note: row.note,
    active: row.active,
  };
}

/** Bots reconocidos que no deben aparecer como "logins sin mapear" en `/discover`. */
const BOT_LOGIN_PATTERNS = ['dependabot', 'github-actions', 'renovate', 'copilot'];
function isBotLogin(login: string): boolean {
  const lower = login.toLowerCase();
  return BOT_LOGIN_PATTERNS.some((b) => lower.includes(b));
}

@controller('/api/settings')
export class SettingsController {
  // ---- settings singleton ----

  @Get('/', requireRole(Role.TeamLead))
  async getSettings(@response() res: Response) {
    const ctx = await getMetricsContext();
    const body: SettingsAdminResponse = { settings: ctx.settings };
    res.status(200).json(body);
  }

  @Put('/', requireRole(Role.TeamLead))
  async putSettings(@body() payload: unknown, @response() res: Response) {
    const parsed = updateSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
      return;
    }
    const db = getDb();
    await db.update(settings).set(parsed.data).where(eq(settings.id, 1));
    invalidateMetricsContext();
    const ctx = await getMetricsContext();
    const body: SettingsAdminResponse = { settings: ctx.settings };
    res.status(200).json(body);
  }

  // ---- people ----

  @Get('/people', requireRole(Role.TeamLead))
  async listPeople(@response() res: Response) {
    const db = getDb();
    const rows = await db.select().from(people);
    const body: PeopleAdminResponse = { people: rows.map(personToDto) };
    res.status(200).json(body);
  }

  @Post('/people', requireRole(Role.TeamLead))
  async createPerson(@body() payload: unknown, @response() res: Response) {
    const parsed = createPersonSchema.safeParse(payload);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
      return;
    }
    const db = getDb();
    const [row] = await db
      .insert(people)
      .values({
        name: parsed.data.name,
        jiraNames: parsed.data.jiraNames ?? [],
        githubLogins: parsed.data.githubLogins ?? [],
        note: parsed.data.note ?? null,
        active: parsed.data.active ?? true,
      })
      .returning();
    invalidateMetricsContext();
    const body: PersonAdminItemResponse = { person: personToDto(row!) };
    res.status(201).json(body);
  }

  @Put('/people/:id', requireRole(Role.TeamLead))
  async updatePerson(@param('id') id: string, @body() payload: unknown, @response() res: Response) {
    const parsed = updatePersonSchema.safeParse(payload);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
      return;
    }
    const db = getDb();
    const [row] = await db.update(people).set(parsed.data).where(eq(people.id, Number(id))).returning();
    if (!row) {
      res.status(404).json({ error: 'Persona no encontrada' });
      return;
    }
    invalidateMetricsContext();
    const body: PersonAdminItemResponse = { person: personToDto(row) };
    res.status(200).json(body);
  }

  @Delete('/people/:id', requireRole(Role.TeamLead))
  async deletePerson(@param('id') id: string, @response() res: Response) {
    const db = getDb();
    const deleted = await db.delete(people).where(eq(people.id, Number(id))).returning({ id: people.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Persona no encontrada' });
      return;
    }
    invalidateMetricsContext();
    res.status(204).send();
  }

  // ---- initiatives ----

  @Get('/initiatives', requireRole(Role.TeamLead))
  async listInitiatives(@response() res: Response) {
    const db = getDb();
    const [initiativeRows, epicRows] = await Promise.all([
      db.select().from(initiatives),
      db.select().from(initiativeEpics),
    ]);
    const list: InitiativeAdminDto[] = initiativeRows.map((i) =>
      initiativeToDto(
        i,
        epicRows.filter((e) => e.initiativeId === i.id).map((e) => e.epicKey),
      ),
    );
    const body: InitiativesAdminResponse = { initiatives: list };
    res.status(200).json(body);
  }

  @Post('/initiatives', requireRole(Role.TeamLead))
  async createInitiative(@body() payload: unknown, @response() res: Response) {
    const parsed = createInitiativeSchema.safeParse(payload);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
      return;
    }
    const db = getDb();
    const [row] = await db
      .insert(initiatives)
      .values({ name: parsed.data.name, slug: parsed.data.slug, position: parsed.data.position ?? 0 })
      .returning();
    const epicKeys = parsed.data.epicKeys ?? [];
    if (epicKeys.length > 0) {
      await db.insert(initiativeEpics).values(epicKeys.map((epicKey) => ({ initiativeId: row!.id, epicKey })));
    }
    invalidateMetricsContext();
    const body: InitiativeAdminItemResponse = { initiative: initiativeToDto(row!, epicKeys) };
    res.status(201).json(body);
  }

  @Put('/initiatives/:id', requireRole(Role.TeamLead))
  async updateInitiative(@param('id') id: string, @body() payload: unknown, @response() res: Response) {
    const parsed = updateInitiativeSchema.safeParse(payload);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
      return;
    }
    const initiativeId = Number(id);
    const db = getDb();
    const { epicKeys, ...rest } = parsed.data;
    let row = (await db.select().from(initiatives).where(eq(initiatives.id, initiativeId)).limit(1))[0];
    if (!row) {
      res.status(404).json({ error: 'Iniciativa no encontrada' });
      return;
    }
    // Renombrar una iniciativa `auto` la fija: el sync de Jira deja de seguir el summary de la épica.
    const patch: Partial<typeof initiatives.$inferInsert> = { ...rest };
    if (row.source === 'auto' && rest.name !== undefined && rest.name.trim() !== row.name.trim()) {
      patch.source = 'manual-renamed';
    }
    if (Object.keys(patch).length > 0) {
      [row] = await db.update(initiatives).set(patch).where(eq(initiatives.id, initiativeId)).returning();
    }
    if (epicKeys) {
      await db.delete(initiativeEpics).where(eq(initiativeEpics.initiativeId, initiativeId));
      if (epicKeys.length > 0) {
        await db.insert(initiativeEpics).values(epicKeys.map((epicKey) => ({ initiativeId, epicKey })));
      }
    }
    const currentEpics = epicKeys ?? (await db.select().from(initiativeEpics).where(eq(initiativeEpics.initiativeId, initiativeId))).map((e) => e.epicKey);
    invalidateMetricsContext();
    const body: InitiativeAdminItemResponse = { initiative: initiativeToDto(row!, currentEpics) };
    res.status(200).json(body);
  }

  @Delete('/initiatives/:id', requireRole(Role.TeamLead))
  async deleteInitiative(@param('id') id: string, @response() res: Response) {
    const db = getDb();
    const deleted = await db
      .delete(initiatives)
      .where(eq(initiatives.id, Number(id)))
      .returning({ id: initiatives.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Iniciativa no encontrada' });
      return;
    }
    invalidateMetricsContext();
    res.status(204).send();
  }

  // ---- discover ----

  /**
   * Huecos de mapeo/configuración calculados a partir de lo que ya hay en Postgres
   * (nunca llama a GitHub/Jira en vivo): repos con PRs, épicas sin iniciativa asignada,
   * logins de GitHub sin persona y nombres de Jira sin persona.
   */
  @Get('/discover', requireRole(Role.TeamLead))
  async discover(@response() res: Response) {
    const db = getDb();
    const [prRows, epicRows, issueRows, peopleRows, initiativeEpicRows] = await Promise.all([
      db.select().from(pullRequests),
      db.select().from(epics),
      db.select().from(issues),
      db.select().from(people),
      db.select().from(initiativeEpics),
    ]);

    const repos = [...new Set(prRows.map((p) => p.repo))].sort();

    const initiativeEpicKeys = new Set(initiativeEpicRows.map((e) => e.epicKey));
    const epicsWithoutInitiative = epicRows
      .filter((e) => !initiativeEpicKeys.has(e.key))
      .map((e) => ({ key: e.key, summary: e.summary }));

    const knownGithubLogins = new Set(peopleRows.flatMap((p) => p.githubLogins));
    const ghLoginsSeen = new Set<string>();
    for (const pr of prRows) {
      if (pr.authorLogin) ghLoginsSeen.add(pr.authorLogin);
      if (pr.mergedByLogin) ghLoginsSeen.add(pr.mergedByLogin);
    }
    const unmappedGithubLogins = [...ghLoginsSeen]
      .filter((login) => !knownGithubLogins.has(login) && !isBotLogin(login))
      .sort();

    const knownJiraNames = new Set(peopleRows.flatMap((p) => p.jiraNames));
    const jiraNamesSeen = new Set<string>();
    for (const issue of issueRows) {
      if (issue.assigneeRaw) jiraNamesSeen.add(issue.assigneeRaw);
    }
    const unmappedJiraNames = [...jiraNamesSeen].filter((n) => !knownJiraNames.has(n)).sort();

    const body: DiscoverResponse = { repos, epicsWithoutInitiative, unmappedGithubLogins, unmappedJiraNames };
    res.status(200).json(body);
  }
}
