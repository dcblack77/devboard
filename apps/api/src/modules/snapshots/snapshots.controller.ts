/**
 * `/api/snapshots`: histórico de `{home, teamSummary}` guardado en la tabla `snapshots`.
 * Lectura (`GET`) accesible a cualquier sesión válida (rol `viewer`); la creación manual
 * (`POST`) requiere rol `tl`. El job semanal (`jobs/scheduler.ts`) usa `takeSnapshot`
 * directamente, sin pasar por HTTP.
 */
import { controller, Get, Post, param, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { Role, SnapshotKind, type SnapshotDetailResponse, type SnapshotListResponse } from '@devboard/shared';
import { getDb } from '../../db/client.js';
import { snapshots } from '../../db/schema.js';
import { getMetricsContext } from '../../domain/context.js';
import { personMetrics, rankTable, teamMedians } from '../../domain/metrics/team.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/**
 * Construye y persiste un snapshot con `{home, teamSummary}` a partir del contexto de
 * métricas actual. Reusado tanto por `POST /api/snapshots` como por el job semanal.
 */
export async function takeSnapshot(kind: SnapshotKind): Promise<{ id: number; takenAt: Date }> {
  const ctx = await getMetricsContext();
  const team = ctx.dstats.filter((d) => d.dev !== '(sin asignar)');
  const ms = team.map((d) => personMetrics(d, { gh: ctx.gh }));
  const meds = teamMedians(ms);
  const rank = rankTable(ms, meds, ctx.settings.thresholds);

  const payload = { home: ctx.home, teamSummary: { rank, medians: meds } };

  const db = getDb();
  const [row] = await db.insert(snapshots).values({ kind, payload }).returning({ id: snapshots.id, takenAt: snapshots.takenAt });
  return { id: row!.id, takenAt: row!.takenAt };
}

@controller('/api/snapshots')
export class SnapshotsController {
  @Get('/', requireRole(Role.Viewer))
  async list(@response() res: Response) {
    const db = getDb();
    const rows = await db
      .select({ id: snapshots.id, takenAt: snapshots.takenAt, kind: snapshots.kind })
      .from(snapshots)
      .orderBy(desc(snapshots.takenAt));
    const body: SnapshotListResponse = {
      snapshots: rows.map((r) => ({ id: r.id, takenAt: r.takenAt.toISOString(), kind: r.kind })),
    };
    res.status(200).json(body);
  }

  @Get('/:id', requireRole(Role.Viewer))
  async detail(@param('id') id: string, @response() res: Response) {
    const db = getDb();
    const rows = await db.select().from(snapshots).where(eq(snapshots.id, Number(id))).limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'Snapshot no encontrado' });
      return;
    }
    const body: SnapshotDetailResponse = {
      id: row.id,
      takenAt: row.takenAt.toISOString(),
      kind: row.kind,
      payload: row.payload,
    };
    res.status(200).json(body);
  }

  @Post('/', requireRole(Role.TeamLead))
  async create(@response() res: Response) {
    const { id, takenAt } = await takeSnapshot(SnapshotKind.Manual);
    res.status(201).json({ id, takenAt: takenAt.toISOString(), kind: SnapshotKind.Manual });
  }
}
