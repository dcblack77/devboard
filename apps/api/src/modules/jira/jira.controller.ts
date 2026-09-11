import { controller, Get, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { Role, type JiraResponse } from '@devboard/shared';
import { getMetricsContext } from '../../domain/context.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/**
 * `GET /api/jira`: estados configurados, estadísticas por estado, tiempo
 * acumulado por tipo/estado y las issues públicas (sin datos de RRHH).
 */
@controller('/api')
export class JiraController {
  @Get('/jira', requireRole(Role.Viewer))
  async jira(@response() res: Response) {
    const ctx = await getMetricsContext();
    const body: JiraResponse = {
      statuses: ctx.issueSettings.statusFlow,
      statusStats: ctx.statusStats,
      daysByStateType: ctx.daysByStateType,
      issues: ctx.rows,
    };
    res.status(200).json(body);
  }
}
