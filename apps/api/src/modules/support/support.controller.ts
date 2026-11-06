import { controller, Get, request, response } from '@expressots/adapter-express';
import type { Request, Response } from 'express';
import { Role, type SupportResponse } from '@devboard/shared';
import { getMetricsContext } from '../../domain/context.js';
import { supportSummary, SUPPORT_NOT_CONFIGURED } from '../../domain/metrics/support.js';
import { requireRole } from '../../middleware/auth.middleware.js';
import { loadSupportTickets } from './support.reader.js';

const MONTHS = new Set([3, 6, 12]);

/** `GET /api/support?months=3|6|12`: métricas del tablero de soporte (`settings.supportProject`). */
@controller('/api')
export class SupportController {
  @Get('/support', requireRole(Role.Viewer))
  async support(@request() req: Request, @response() res: Response) {
    const monthsRaw = Number(req.query.months ?? 12);
    const months = MONTHS.has(monthsRaw) ? monthsRaw : 12;

    const ctx = await getMetricsContext();
    const s = ctx.settings;
    if (!s.supportProject) {
      res.status(200).json(SUPPORT_NOT_CONFIGURED);
      return;
    }

    const to = ctx.now;
    const from = new Date(to);
    from.setMonth(from.getMonth() - months);

    const tickets = await loadSupportTickets(s.supportProject);
    const aliases = s.statusAliases ?? {};
    const flow = s.statusFlow ?? [];
    const body: SupportResponse = supportSummary(
      {
        project: s.supportProject,
        tickets,
        mainProject: s.jiraProject,
        techStatus: s.supportTechStatus ? (aliases[s.supportTechStatus] ?? s.supportTechStatus) : null,
        sla: s.supportSla ?? {},
        aliases,
        finalStatus: flow[flow.length - 1] ?? 'Done',
        now: to,
      },
      { from, to },
    );
    res.status(200).json(body);
  }
}
