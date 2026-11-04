/**
 * Mapa de skills: `GET /api/skills` (matriz + cobertura, viewer), `GET /api/team/:slug/skills`
 * (detalle por persona, tl), `POST /api/skills/recompute` (tl) y administración bajo
 * `/api/settings/skills` y `/api/settings/people/:id/{skills,seniority}` (tl).
 */
import { controller, Get, Post, Put, Delete, body, param, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { z } from 'zod';
import {
  Role,
  type CreateSkillRequest,
  type PersonSkillItemResponse,
  type SetPersonSkillRequest,
  type SetSeniorityRequest,
  type SkillItemResponse,
  type UpdateSkillRequest,
} from '@devboard/shared';
import { requireRole } from '../../middleware/auth.middleware.js';
import { DrizzleSkillsRepo, type SkillsRepo } from './skills.repo.js';
import { SkillsService } from './skills.service.js';

const createSkillSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(['competency', 'stack']),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
}) satisfies z.ZodType<CreateSkillRequest>;

const updateSkillSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}) satisfies z.ZodType<UpdateSkillRequest>;

const setPersonSkillSchema = z.object({
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  evidence: z.string().nullable().optional(),
}) satisfies z.ZodType<SetPersonSkillRequest>;

const setSenioritySchema = z.object({
  seniority: z.enum(['junior', 'mid', 'senior']).nullable(),
}) satisfies z.ZodType<SetSeniorityRequest>;

/** Convierte un parámetro de ruta a id numérico; `null` si no es un entero válido. */
function toId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

@controller('/api')
export class SkillsController {
  private readonly service = new SkillsService();

  @Get('/skills', requireRole(Role.Viewer))
  async matrix(@response() res: Response) {
    res.status(200).json(await this.service.matrix());
  }

  @Post('/skills/recompute', requireRole(Role.TeamLead))
  async recompute(@response() res: Response) {
    res.status(200).json(await this.service.recompute());
  }

  @Get('/team/:slug/skills', requireRole(Role.TeamLead))
  async person(@param('slug') slug: string, @response() res: Response) {
    const body = await this.service.person(slug);
    if (!body) {
      res.status(404).json({ error: 'Persona no encontrada' });
      return;
    }
    res.status(200).json(body);
  }
}

@controller('/api/settings')
export class SkillsAdminController {
  private readonly repo: SkillsRepo = new DrizzleSkillsRepo();

  @Post('/skills', requireRole(Role.TeamLead))
  async createSkill(@body() payload: unknown, @response() res: Response) {
    const parsed = createSkillSchema.safeParse(payload);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues });
      return;
    }
    const skill = await this.repo.createSkill({
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    });
    if (!skill) {
      res.status(409).json({ error: 'Ya existe una skill con ese nombre' });
      return;
    }
    const body: SkillItemResponse = { skill };
    res.status(201).json(body);
  }

  @Put('/skills/:skillId', requireRole(Role.TeamLead))
  async updateSkill(@param('skillId') skillIdRaw: string, @body() payload: unknown, @response() res: Response) {
    const parsed = updateSkillSchema.safeParse(payload);
    const skillId = toId(skillIdRaw);
    if (!parsed.success || skillId === null) {
      res.status(400).json({ error: 'Payload inválido', issues: parsed.success ? [] : parsed.error.issues });
      return;
    }
    const skill = await this.repo.updateSkill(skillId, parsed.data);
    if (!skill) {
      res.status(404).json({ error: 'Skill no encontrada' });
      return;
    }
    const body: SkillItemResponse = { skill };
    res.status(200).json(body);
  }

  @Put('/people/:personId/skills/:skillId', requireRole(Role.TeamLead))
  async setPersonSkill(
    @param('personId') personIdRaw: string,
    @param('skillId') skillIdRaw: string,
    @body() payload: unknown,
    @response() res: Response,
  ) {
    const parsed = setPersonSkillSchema.safeParse(payload);
    const personId = toId(personIdRaw);
    const skillId = toId(skillIdRaw);
    if (!parsed.success || personId === null || skillId === null) {
      res.status(400).json({ error: 'Payload inválido', issues: parsed.success ? [] : parsed.error.issues });
      return;
    }
    const row = await this.repo.upsertManual(personId, skillId, parsed.data.level, parsed.data.evidence ?? null);
    if (!row) {
      res.status(404).json({ error: 'Persona o skill no encontrada' });
      return;
    }
    const body: PersonSkillItemResponse = {
      row: { personId: row.personId, skillId: row.skillId, level: row.level as 0 | 1 | 2 | 3, source: row.source, evidence: row.evidence },
    };
    res.status(200).json(body);
  }

  @Delete('/people/:personId/skills/:skillId', requireRole(Role.TeamLead))
  async deletePersonSkill(@param('personId') personIdRaw: string, @param('skillId') skillIdRaw: string, @response() res: Response) {
    const personId = toId(personIdRaw);
    const skillId = toId(skillIdRaw);
    if (personId === null || skillId === null) {
      res.status(400).json({ error: 'Identificadores inválidos' });
      return;
    }
    const deleted = await this.repo.deleteRow(personId, skillId);
    if (!deleted) {
      res.status(404).json({ error: 'Fila no encontrada' });
      return;
    }
    res.status(204).send();
  }

  @Put('/people/:personId/seniority', requireRole(Role.TeamLead))
  async setSeniority(@param('personId') personIdRaw: string, @body() payload: unknown, @response() res: Response) {
    const parsed = setSenioritySchema.safeParse(payload);
    const personId = toId(personIdRaw);
    if (!parsed.success || personId === null) {
      res.status(400).json({ error: 'Payload inválido', issues: parsed.success ? [] : parsed.error.issues });
      return;
    }
    const person = await this.repo.setSeniority(personId, parsed.data.seniority);
    if (!person) {
      res.status(404).json({ error: 'Persona no encontrada' });
      return;
    }
    res.status(200).json({ person: { id: person.id, name: person.name, seniority: person.seniority } });
  }
}
