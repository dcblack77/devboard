import { controller, Get, Post, request, response } from '@expressots/adapter-express';
import type { Request, Response } from 'express';
import { Role, type SyncRunDto, type SyncStateDto, type SyncStatusDto } from '@devboard/shared';
import { SyncService, isSyncRunning } from './sync.service.js';
import { requireRole } from '../../middleware/auth.middleware.js';

// `@controller()` ya aplica `@injectable()` internamente; no lo dupliquemos aquí.
@controller('/api/sync')
export class SyncController {
  private readonly syncService = new SyncService();

  /** Últimas ejecuciones + salud por fuente (stale si la última falló o la última ok es vieja). */
  @Get('/status')
  async status(@response() res: Response) {
    const [rows, health] = await Promise.all([this.syncService.latestRuns(), this.syncService.health()]);
    const runs: SyncRunDto[] = rows.map((r) => ({
      id: r.id,
      source: r.source,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      ok: r.ok,
      error: r.error,
      counts: r.counts ?? {},
    }));
    const body: SyncStatusDto = { runs, health };
    res.status(200).json(body);
  }

  /** Frescura de los datos por fuente y si hay una actualización en curso (público). */
  @Get('/state')
  async state(@response() res: Response) {
    const body: SyncStateDto = await this.syncService.state();
    res.status(200).json(body);
  }

  @Post('/run', requireRole(Role.TeamLead))
  async run(@request() _req: Request, @response() res: Response) {
    // Se lanza en segundo plano: la sincronización real puede tardar; el cliente consulta
    // el progreso vía /api/sync/state. Si ya hay una en curso, no se lanza otra.
    if (isSyncRunning()) {
      res.status(409).json({ ok: false, message: 'Ya hay una actualización en curso' });
      return;
    }
    this.syncService.runAll().catch(() => undefined);
    res.status(202).json({ ok: true, message: 'Sincronización lanzada' });
  }
}
