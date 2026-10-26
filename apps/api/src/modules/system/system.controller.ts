import { controller, Get, request, response } from '@expressots/adapter-express';
import type { Request, Response } from 'express';
import { Role, type SystemResponse } from '@devboard/shared';
import { getMetricsContext } from '../../domain/context.js';
import { systemSummary } from '../../domain/metrics/system.js';
import { requireRole } from '../../middleware/auth.middleware.js';

const MONTHS = new Set([3, 6, 12]);

/** `GET /api/system?months=3|6|12&repo=all|<repo>`: DORA, práctica de PR, ciclo Kanban y lotes. */
@controller('/api')
export class SystemController {
  @Get('/system', requireRole(Role.Viewer))
  async system(@request() req: Request, @response() res: Response) {
    const monthsRaw = Number(req.query.months ?? 12);
    const months = MONTHS.has(monthsRaw) ? monthsRaw : 12;
    const repo = typeof req.query.repo === 'string' && req.query.repo !== '' ? req.query.repo : 'all';

    const ctx = await getMetricsContext();
    const to = ctx.now;
    const from = new Date(to);
    from.setMonth(from.getMonth() - months);

    const sys = ctx.system;
    const byRepo = <T extends { repo: string }>(xs: T[]) => (repo === 'all' ? xs : xs.filter((x) => x.repo === repo));
    const body: SystemResponse = systemSummary(
      { prs: byRepo(sys.prs), runs: byRepo(sys.runs), issues: sys.issues, settings: sys.settings },
      { from, to },
    );
    res.status(200).json(body);
  }
}
