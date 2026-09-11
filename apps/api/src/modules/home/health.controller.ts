import { controller, Get, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import type { HealthResponse } from '@devboard/shared';
import { pingDb } from '../../db/client.js';
import { getPackageVersion } from '../../utils/package-info.js';

// `@controller()` de @expressots/adapter-express ya aplica `@injectable()` internamente
// (decorate(injectable(), target)); añadirlo aquí de nuevo revienta el arranque con
// "Cannot apply @injectable decorator multiple times".
@controller('/api')
export class HealthController {
  @Get('/health')
  async health(@response() res: Response) {
    const db = await pingDb();
    const body: HealthResponse = { ok: true, db, version: getPackageVersion() };
    res.status(200).json(body);
  }
}
