import { controller, Get, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { Role, type PeopleResponse } from '@teampulse/shared';
import { getMetricsContext } from '../../domain/context.js';
import { personMetrics } from '../../domain/metrics/team.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/**
 * `GET /api/people`: vista RRHH en llano, una entrada por persona, sin
 * comparativas ni ranking entre compañeros (eso es cosa de `/api/team`,
 * que requiere rol `tl`).
 */
@controller('/api')
export class PeopleController {
  @Get('/people', requireRole(Role.Viewer))
  async people(@response() res: Response) {
    const ctx = await getMetricsContext();
    const list = ctx.dstats
      .filter((d) => d.dev !== '(sin asignar)')
      .map((d) => personMetrics(d, { gh: ctx.gh }));
    const body: PeopleResponse = { people: list };
    res.status(200).json(body);
  }
}
