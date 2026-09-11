import { controller, Get, response } from '@expressots/adapter-express';
import type { Response } from 'express';
import { Role, type HomeResponse } from '@devboard/shared';
import { getMetricsContext } from '../../domain/context.js';
import { requireRole } from '../../middleware/auth.middleware.js';

/** `GET /api/home`: las cuatro preguntas de portada (Compromiso/Entrega/Riesgo/Calidad). */
@controller('/api')
export class HomeController {
  @Get('/home', requireRole(Role.Viewer))
  async home(@response() res: Response) {
    const ctx = await getMetricsContext();
    const body: HomeResponse = ctx.home;
    res.status(200).json(body);
  }
}
