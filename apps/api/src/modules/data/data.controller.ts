import { controller, Get, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { Role, type DataResponse } from '@devboard/shared';
import { getMetricsContext } from '../../domain/context.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/** `GET /api/data/issues` y `GET /api/data/prs`: listados completos para la vista "Datos" con filtros en cliente. */
@controller('/api/data')
export class DataController {
  @Get('/issues', requireRole(Role.Viewer))
  async issues(@response() res: Response) {
    const ctx = await getMetricsContext();
    const body: DataResponse = { items: ctx.rows };
    res.status(200).json(body);
  }

  @Get('/prs', requireRole(Role.Viewer))
  async prs(@response() res: Response) {
    const ctx = await getMetricsContext();
    const body: DataResponse = { items: ctx.prs };
    res.status(200).json(body);
  }
}
