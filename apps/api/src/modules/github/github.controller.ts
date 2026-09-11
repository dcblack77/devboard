import { controller, Get, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { Role, type GithubResponse } from '@devboard/shared';
import { getMetricsContext } from '../../domain/context.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/** `GET /api/github`: agregados de code review (`reviewStats`) + PRs analizadas. */
@controller('/api')
export class GithubController {
  @Get('/github', requireRole(Role.Viewer))
  async github(@response() res: Response) {
    const ctx = await getMetricsContext();
    const body: GithubResponse = {
      reviewStats: ctx.gh,
      prs: ctx.prs,
    };
    res.status(200).json(body);
  }
}
