import { controller, Get, Post, request, response } from '@expressots/adapter-express';
import type { Request, Response } from 'express';
import { Role, type SyncRunDto } from '@devboard/shared';
import { SyncService } from './sync.service.js';
import { requireRole } from '../../middleware/auth.middleware.js';

// `@controller()` ya aplica `@injectable()` internamente; no lo dupliquemos aquí.
@controller('/api/sync')
export class SyncController {
  private readonly syncService = new SyncService();

  @Get('/status')
  async status(@response() res: Response) {
    const rows = await this.syncService.latestRuns();
    const body: SyncRunDto[] = rows.map((r) => ({
      id: r.id,
      source: r.source,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      ok: r.ok,
      error: r.error,
      counts: (r.counts as Record<string, number>) ?? {},
    }));
    res.status(200).json(body);
  }

  @Post('/run', requireRole(Role.TeamLead))
  async run(@request() _req: Request, @response() res: Response) {
    // Se lanza en segundo plano: la sincronización real puede tardar; el cliente consulta
    // el progreso vía /api/sync/status.
    this.syncService.runAll().catch(() => undefined);
    res.status(202).json({ ok: true, message: 'Sincronización lanzada' });
  }
}
