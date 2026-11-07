import { controller, Get, Post, body, request, response } from '@expressots/adapter-express';
import type { Request, Response } from 'express';
import { Role, type LoginRequest, type LoginResponse, type MeResponse } from '@teampulse/shared';
import { loadEnv } from '../../config/env.js';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from './session.js';

// `@controller()` ya aplica `@injectable()` internamente; no lo dupliquemos aquí.
@controller('/api/auth')
export class AuthController {
  @Post('/login')
  login(@body() payload: LoginRequest, @request() _req: Request, @response() res: Response) {
    const env = loadEnv();
    const password = payload?.password ?? '';

    let role: Role | null = null;
    if (!env.TL_PASSWORD || (password.length > 0 && password === env.TL_PASSWORD)) {
      role = Role.TeamLead;
    } else if (env.VIEWER_PASSWORD && password.length > 0 && password === env.VIEWER_PASSWORD) {
      role = Role.Viewer;
    }

    if (!role) {
      res.status(401).json({ error: 'Contraseña incorrecta' });
      return;
    }

    const cookieValue = createSessionCookieValue(role);
    res.cookie(SESSION_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE_MS,
    });

    const body_: LoginResponse = { role };
    res.status(200).json(body_);
  }

  @Post('/logout')
  logout(@response() res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(200).json({ ok: true });
  }

  @Get('/me')
  me(@request() req: Request, @response() res: Response) {
    const body_: MeResponse = {
      role: (req.role as Role | null) ?? null,
      authDisabled: !loadEnv().TL_PASSWORD,
    };
    res.status(200).json(body_);
  }
}
