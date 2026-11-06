import { controller, Get, request, response } from '@expressots/adapter-express';
import type { Request, Response } from 'express';
import { ALL_BOARDS, Role, boardOf, devBoards, supportBoards, type SupportResponse } from '@devboard/shared';
import { getMetricsContext } from '../../domain/context.js';
import { supportByBoard, supportSummary, SUPPORT_NOT_CONFIGURED, type SupportInput } from '../../domain/metrics/support.js';
import { requireRole } from '../../middleware/auth.middleware.js';
import { loadSupportTickets } from './support.reader.js';

const MONTHS = new Set([3, 6, 12]);

/**
 * `GET /api/support?months=3|6|12&board=ALL|<KEY>`: métricas de los tableros de soporte
 * (`settings.jiraBoards`, kind support). `ALL` (por defecto) agrega todos; una clave debe ser
 * uno de los tableros de soporte (si no, 400). `byBoard` siempre cubre todos los tableros.
 */
@controller('/api')
export class SupportController {
  @Get('/support', requireRole(Role.Viewer))
  async support(@request() req: Request, @response() res: Response) {
    const monthsRaw = Number(req.query.months ?? 12);
    const months = MONTHS.has(monthsRaw) ? monthsRaw : 12;
    const boardRaw = typeof req.query.board === 'string' ? req.query.board.trim().toUpperCase() : '';
    const selectedBoard = boardRaw === '' ? ALL_BOARDS : boardRaw;

    const ctx = await getMetricsContext();
    const s = ctx.settings;
    const support = supportBoards(s);
    if (support.length === 0) {
      res.status(200).json(SUPPORT_NOT_CONFIGURED);
      return;
    }
    const boards = support.map((b) => b.key);
    if (selectedBoard !== ALL_BOARDS && !boards.includes(selectedBoard)) {
      res.status(400).json({ error: `Tablero de soporte desconocido: ${selectedBoard}` });
      return;
    }

    const to = ctx.now;
    const from = new Date(to);
    from.setMonth(from.getMonth() - months);
    const window = { from, to };

    const tickets = await loadSupportTickets(boards);
    const aliases = s.statusAliases ?? {};
    const flow = s.statusFlow ?? [];
    const base: Omit<SupportInput, 'project' | 'tickets'> = {
      devProjects: devBoards(s).map((b) => b.key),
      techStatus: s.supportTechStatus ? (aliases[s.supportTechStatus] ?? s.supportTechStatus) : null,
      sla: s.supportSla ?? {},
      aliases,
      finalStatus: flow[flow.length - 1] ?? 'Done',
      now: to,
    };
    const single = selectedBoard !== ALL_BOARDS ? selectedBoard : boards.length === 1 ? boards[0]! : null;
    const selected = selectedBoard === ALL_BOARDS ? tickets : tickets.filter((t) => boardOf(t.key) === selectedBoard);

    const body: SupportResponse = {
      ...supportSummary({ ...base, project: single, tickets: selected }, window),
      boards,
      boardNames: Object.fromEntries(support.map((b) => [b.key, b.name ?? null])),
      selectedBoard,
      byBoard: supportByBoard({ ...base, project: null, tickets }, boards, window),
    };
    res.status(200).json(body);
  }
}
