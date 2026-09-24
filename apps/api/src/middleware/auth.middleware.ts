import type { NextFunction, Request, Response } from 'express';
import { Role } from '@devboard/shared';
import { loadEnv } from '../config/env.js';
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from '../modules/auth/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Rol resuelto de la sesión actual, o `null` si no hay sesión válida. */
      role?: Role | null;
    }
  }
}

/**
 * Resuelve `req.role` a partir de la cookie de sesión (si existe). No bloquea la petición:
 * las rutas públicas siguen funcionando sin sesión. Debe montarse antes de cualquier
 * `requireRole`.
 */
export function resolveSession(req: Request, _res: Response, next: NextFunction): void {
  // Sin TL_PASSWORD no hay login: todo el mundo es TL.
  if (!loadEnv().TL_PASSWORD) {
    req.role = Role.TeamLead;
    next();
    return;
  }
  const raw = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const payload = verifySessionCookieValue(raw);
  req.role = payload?.role ?? null;
  next();
}

/**
 * Exige un rol mínimo para acceder a la ruta.
 * - `requireRole('tl')`: solo sesión con rol `tl`.
 * - `requireRole('viewer')`: cualquier sesión válida (`viewer` o `tl`); si `VIEWER_PASSWORD`
 *   está vacío, las rutas de solo-viewer se consideran públicas y no requieren sesión.
 */
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const env = loadEnv();

    if (role === Role.Viewer && !env.VIEWER_PASSWORD) {
      next();
      return;
    }

    if (role === Role.TeamLead) {
      if (req.role === Role.TeamLead) {
        next();
        return;
      }
      res.status(401).json({ error: 'No autorizado: se requiere rol tl' });
      return;
    }

    // role === Role.Viewer con VIEWER_PASSWORD configurada: exige cualquier sesión válida.
    if (req.role === Role.Viewer || req.role === Role.TeamLead) {
      next();
      return;
    }
    res.status(401).json({ error: 'No autorizado: se requiere sesión' });
  };
}
