import type { CoreConfig } from "./env";

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(null, { status: 302, headers: h });
}

export function withCookies(res: Response, cookies: (string | null | undefined)[]): Response {
  for (const c of cookies) if (c) res.headers.append("set-cookie", c);
  return res;
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function cookie(name: string, value: string, opts: { maxAge: number; path?: string; secure: boolean }): string {
  return `${name}=${encodeURIComponent(value)}; Path=${opts.path ?? "/"}; Max-Age=${opts.maxAge}; HttpOnly; SameSite=Lax${opts.secure ? "; Secure" : ""}`;
}

/**
 * CSRF defence for state-changing requests: same-origin Origin header (or
 * Sec-Fetch-Site) plus a custom header that cross-site forms can't send.
 */
export function checkSameOrigin(req: Request, cfg: CoreConfig): boolean {
  if (req.headers.get("x-life-os") !== "1") return false;
  const origin = req.headers.get("origin");
  if (origin) return !!cfg.baseUrl && origin === cfg.baseUrl;
  return req.headers.get("sec-fetch-site") === "same-origin";
}

/** Keys whose values must never be logged (OAuth codes, tokens, secrets…). Error *codes* are fine. */
const SECRET_KEYS = /^(code|state)$|token|secret|password|authorization|verifier|cookie/i;

/** Structured log line with secrets redacted — safe for audit trails. */
export function safeLog(event: string, data: Record<string, unknown> = {}) {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) clean[k] = SECRET_KEYS.test(k) ? "[redacted]" : v;
  console.info(JSON.stringify({ at: new Date().toISOString(), event, ...clean }));
}
