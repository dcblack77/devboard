import { controller, Get, param, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { Role, type InitiativesResponse } from '@devboard/shared';
import { getMetricsContext } from '../../domain/context.js';
import { ragInitiative } from '../../domain/metrics/initiatives.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/** `GET /api/initiatives` y `GET /api/initiatives/:slug`: avance por iniciativa + RAG. */
@controller('/api')
export class InitiativesController {
  @Get('/initiatives', requireRole(Role.Viewer))
  async list(@response() res: Response) {
    const ctx = await getMetricsContext();
    const list = ctx.initiativesList.map((i) => ({ ...i, rag: ragInitiative(i) }));
    const body: InitiativesResponse = { initiatives: list };
    res.status(200).json(body);
  }

  @Get('/initiatives/:slug', requireRole(Role.Viewer))
  async detail(@param('slug') slug: string, @response() res: Response) {
    const ctx = await getMetricsContext();
    const initiative = ctx.initiativesList.find((i) => i.slug === slug);
    if (!initiative) {
      res.status(404).json({ error: 'Iniciativa no encontrada' });
      return;
    }
    const body: InitiativesResponse = { initiatives: { ...initiative, rag: ragInitiative(initiative) } };
    res.status(200).json(body);
  }
}
