import { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from '../config.js';
import type { SessionPayload } from '../types/index.js';

const SESSION_COOKIE = config.session.cookieName;

function serializeSession(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function parseSession(raw: string): SessionPayload | null {
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

export function setSessionCookie(c: Context, payload: SessionPayload): void {
  setCookie(c, SESSION_COOKIE, serializeSession(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: config.session.maxAge,
    path: '/',
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/**
 * Middleware that attaches the session payload to `c.var.session`.
 * Does NOT block unauthenticated requests — use `requireAuth` for that.
 */
export async function sessionMiddleware(c: Context, next: Next): Promise<void> {
  const raw = getCookie(c, SESSION_COOKIE);
  const session = raw ? parseSession(raw) : null;
  c.set('session', session);
  await next();
}

/**
 * Middleware that rejects requests without a valid session (401).
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const session: SessionPayload | null = c.get('session');
  if (!session) {
    c.status(401);
    return c.json({ error: 'Unauthorized — please log in' });
  }
  await next();
}
