import crypto from 'node:crypto';
import { loadEnv } from '../../config/env.js';
import { Role } from '@teampulse/shared';

interface SessionPayload {
  role: Role;
  issuedAt: number;
}

const COOKIE_NAME = 'devboard_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

function sign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

/**
 * Serializa y firma una sesión con HMAC (no usamos JWT para mantener el payload mínimo y
 * evitar dependencias extra). Formato: `<base64url(json)>.<hmac>`.
 */
export function createSessionCookieValue(role: Role): string {
  const env = loadEnv();
  const payload: SessionPayload = { role, issuedAt: Date.now() };
  const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(json, env.SESSION_SECRET);
  return `${json}.${signature}`;
}

/** Verifica la firma y expiración de una cookie de sesión. Devuelve `null` si es inválida. */
export function verifySessionCookieValue(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const env = loadEnv();
  const [json, signature] = value.split('.');
  if (!json || !signature) return null;

  const expected = sign(json, env.SESSION_SECRET);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as SessionPayload;
    if (Date.now() - payload.issuedAt > MAX_AGE_MS) return null;
    if (payload.role !== Role.TeamLead && payload.role !== Role.Viewer) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE_MS = MAX_AGE_MS;
