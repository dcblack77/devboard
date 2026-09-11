/**
 * `GET /api/export/team.xlsx`: descarga en Excel del estado actual del equipo (rol `tl`).
 * Reusa el `MetricsContext` cacheado y `personMetrics`/`teamMedians` de `/api/team` para no
 * duplicar cálculo; la construcción del workbook en sí (`buildTeamWorkbook`) es pura.
 */
import { controller, Get, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { Role } from '@devboard/shared';
import { getMetricsContext } from '../../domain/context.js';
import { personMetrics, teamMedians } from '../../domain/metrics/team.js';
import { requireRole } from '../../middleware/auth.middleware.js';
import { buildTeamWorkbook } from './team-xlsx.js';

@controller('/api/export')
export class ExportController {
  @Get('/team.xlsx', requireRole(Role.TeamLead))
  async teamXlsx(@response() res: Response) {
    const ctx = await getMetricsContext();
    const team = ctx.dstats.filter((d) => d.dev !== '(sin asignar)');
    const peopleMetrics = team.map((d) => personMetrics(d, { gh: ctx.gh }));
    const medians = teamMedians(peopleMetrics);

    const since = ctx.settings.sinceDate ?? '—';
    const periodo = `${since} → ${ctx.now.toISOString().slice(0, 10)}`;

    const wb = buildTeamWorkbook({
      home: ctx.home,
      peopleMetrics,
      medians,
      initiativesList: ctx.initiativesList,
      issues: ctx.rows,
      prs: ctx.prs,
      periodo,
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="devboard-equipo.xlsx"');
    res.status(200).send(Buffer.from(buffer));
  }
}
