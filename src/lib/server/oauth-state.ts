/**
 * OAuth `state` + PKCE verifier, kept in a short-lived, encrypted, HttpOnly
 * cookie bound to the session and provider. Single use: the callback clears it.
 */
import { decrypt, encrypt, pkcePair, randomToken, safeEqual } from "./crypto";

export const STATE_COOKIE = "plos_oauth";
export const STATE_TTL_SEC = 600;

interface Payload {
  p: string;
  s: string;
  v: string | null;
  sid: string;
  exp: number;
}

export function createState(opts: { provider: string; sessionId: string; usePkce: boolean; key: Buffer; now?: number }) {
  const state = randomToken(32);
  const pkce = opts.usePkce ? pkcePair() : null;
  const payload: Payload = { p: opts.provider, s: state, v: pkce?.verifier ?? null, sid: opts.sessionId, exp: (opts.now ?? Date.now()) + STATE_TTL_SEC * 1000 };
  return { state, challenge: pkce?.challenge ?? null, cookieValue: encrypt(opts.key, JSON.stringify(payload), "oauth-state") };
}

export type StateCheck = { ok: true; verifier: string | null } | { ok: false; reason: "missing" | "tampered" | "expired" | "provider_mismatch" | "session_mismatch" | "state_mismatch" };

export function validateState(opts: { cookieValue: string | null; stateParam: string | null; provider: string; sessionId: string | null; key: Buffer; now?: number }): StateCheck {
  if (!opts.cookieValue || !opts.stateParam) return { ok: false, reason: "missing" };
  let p: Payload;
  try {
    p = JSON.parse(decrypt(opts.key, opts.cookieValue, "oauth-state"));
  } catch {
    return { ok: false, reason: "tampered" };
  }
  if ((opts.now ?? Date.now()) > p.exp) return { ok: false, reason: "expired" };
  if (p.p !== opts.provider) return { ok: false, reason: "provider_mismatch" };
  if (!opts.sessionId || !safeEqual(p.sid, opts.sessionId)) return { ok: false, reason: "session_mismatch" };
  if (!safeEqual(p.s, opts.stateParam)) return { ok: false, reason: "state_mismatch" };
  return { ok: true, verifier: p.v };
}
