import { controller, Get, param, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { Role, type PersonDetailResponse, type TeamResponse } from '@teampulse/shared';
import { getMetricsContext } from '../../domain/context.js';
import { personMetrics, personSummary, rankTable, teamMedians } from '../../domain/metrics/team.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/**
 * `GET /api/team` (ranking + medianas + resúmenes), `GET /api/team/:slug`
 * (perfil completo con medianas y otros nombres) y `GET /api/me/:slug`
 * (= team/:slug pero sin medianas de equipo, para el enlace personal que
 * cada dev recibe sin comparativas ni nombres ajenos).
 */
@controller('/api')
export class TeamController {
  @Get('/team', requireRole(Role.TeamLead))
  async team(@response() res: Response) {
    const ctx = await getMetricsContext();
    const team = ctx.dstats.filter((d) => d.dev !== '(sin asignar)');
    const ms = team.map((d) => personMetrics(d, { gh: ctx.gh }));
    const meds = teamMedians(ms);
    const rank = rankTable(ms, meds, ctx.settings.thresholds);
    const summaries = ms.map((m) => ({ name: m.name, slug: m.slug, ...personSummary(m, meds) }));
    const body: TeamResponse = { rank, medians: meds, summaries };
    res.status(200).json(body);
  }

  @Get('/team/:slug', requireRole(Role.TeamLead))
  async teamPerson(@param('slug') slug: string, @response() res: Response) {
    const ctx = await getMetricsContext();
    const team = ctx.dstats.filter((d) => d.dev !== '(sin asignar)');
    const dstat = team.find((d) => d.slug === slug);
    if (!dstat) {
      res.status(404).json({ error: 'Persona no encontrada' });
      return;
    }
    const ms = team.map((d) => personMetrics(d, { gh: ctx.gh }));
    const meds = teamMedians(ms);
    const m = personMetrics(dstat, { gh: ctx.gh });
    const body: PersonDetailResponse = { metrics: m, summary: personSummary(m, meds), devStat: dstat };
    res.status(200).json(body);
  }

  @Get('/me/:slug', requireRole(Role.TeamLead))
  async me(@param('slug') slug: string, @response() res: Response) {
    const ctx = await getMetricsContext();
    const dstat = ctx.dstats.find((d) => d.dev !== '(sin asignar)' && d.slug === slug);
    if (!dstat) {
      res.status(404).json({ error: 'Persona no encontrada' });
      return;
    }
    const m = personMetrics(dstat, { gh: ctx.gh });
    // Sin medianas de equipo ni nombres de otras personas: vista personal, no comparativa.
    const body: PersonDetailResponse = { metrics: m, summary: personSummary(m, null), devStat: dstat };
    res.status(200).json(body);
  }
}
