/**
 * Anonymous, signed server session. The app has no user accounts yet, so the
 * session id is the owner key for integration records. With Supabase Auth the
 * owner key becomes auth.uid() (see docs/INTEGRATIONS.md).
 */
import { hmac, randomToken, safeEqual } from "./crypto";
import { cookie, readCookie } from "./http";
import type { CoreConfig } from "./env";

export const SESSION_COOKIE = "plos_sid";

export function verifySessionValue(value: string | null, secret: string): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const id = value.slice(0, i);
  const sig = value.slice(i + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(id) && safeEqual(sig, hmac(secret, `sid:${id}`)) ? id : null;
}

export function getSession(req: Request, cfg: CoreConfig, create = true): { id: string | null; setCookie: string | null } {
  if (!cfg.sessionSecret) return { id: null, setCookie: null };
  const existing = verifySessionValue(readCookie(req, SESSION_COOKIE), cfg.sessionSecret);
  if (existing) return { id: existing, setCookie: null };
  if (!create) return { id: null, setCookie: null };
  const id = randomToken(32);
  const value = `${id}.${hmac(cfg.sessionSecret, `sid:${id}`)}`;
  return { id, setCookie: cookie(SESSION_COOKIE, value, { maxAge: 60 * 60 * 24 * 365, secure: cfg.secureCookies }) };
}
