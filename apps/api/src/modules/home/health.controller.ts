import { controller, Get, response } from '@expressots/adapter-express';
import { injectable } from '@expressots/core';
import type { Response } from 'express';
import type { HealthResponse } from '@devboard/shared';
import { pingDb } from '../../db/client.js';
import { getPackageVersion } from '../../utils/package-info.js';

@injectable()
@controller('/api')
export class HealthController {
  @Get('/health')
  async health(@response() res: Response) {
    const db = await pingDb();
    const body: HealthResponse = { ok: true, db, version: getPackageVersion() };
    res.status(200).json(body);
  }
}
