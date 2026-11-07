import { controller, Get, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { Role, type EpicsResponse } from '@teampulse/shared';
import { getMetricsContext } from '../../domain/context.js';
import { pctDone, macroCount } from '../../domain/metrics/initiatives.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/** `GET /api/epics`: avance épica a épica (todas las épicas del índice, agrupen o no iniciativa). */
@controller('/api')
export class EpicsController {
  @Get('/epics', requireRole(Role.Viewer))
  async epics(@response() res: Response) {
    const ctx = await getMetricsContext();
    const list = Object.values(ctx.epicIndex).map((e) => ({
      key: e.key,
      summary: e.summary,
      status: e.status,
      assigneeRaw: e.assigneeRaw,
      childrenTotal: e.children.filter((c) => c.type !== 'Subtarea').length,
      childrenByMacro: macroCount(e.children, ctx.issueSettings),
      pctDone: pctDone(e.children, ctx.issueSettings),
    }));
    const body: EpicsResponse = { epics: list };
    res.status(200).json(body);
  }
}
