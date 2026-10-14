import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, loadKey } from "@/lib/server/crypto";
import { createState, validateState, STATE_COOKIE } from "@/lib/server/oauth-state";
import { coreConfig } from "@/lib/server/env";
import { verifySessionValue } from "@/lib/server/session";
import { MemoryStore } from "@/lib/server/store/memory";
import { setStoreForTests } from "@/lib/server/store";
import { SupabaseStore } from "@/lib/server/store/supabase";
import { handleCallback, handleConnect, handleDisconnect, handleStatus, handleSync, openTokens, sealTokens } from "@/lib/server/handlers";

const KEY_B64 = randomBytes(32).toString("base64");
const BASE = "https://lifeos.example.com";

function setEnv(extra: Record<string, string | undefined> = {}) {
  for (const k of ["APP_BASE_URL", "SESSION_SECRET", "INTEGRATIONS_ENCRYPTION_KEY", "INTEGRATIONS_STORE", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_CLIENT_SECRET", "NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"]) delete process.env[k];
  Object.assign(process.env, {
    APP_BASE_URL: BASE,
    SESSION_SECRET: "s".repeat(40),
    INTEGRATIONS_ENCRYPTION_KEY: KEY_B64,
    GOOGLE_CLIENT_ID: "gid",
    GOOGLE_CLIENT_SECRET: "gsecret",
    MERCADOPAGO_CLIENT_ID: "mpid",
    MERCADOPAGO_CLIENT_SECRET: "mpsecret",
    ...extra,
  });
  for (const [k, v] of Object.entries(extra)) if (v === undefined) delete process.env[k];
}

/** Collects Set-Cookie values into a Cookie header (cookie jar). */
function jar(...responses: Response[]) {
  const map = new Map<string, string>();
  for (const r of responses)
    for (const sc of r.headers.getSetCookie()) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (/Max-Age=0/.test(sc)) map.delete(name);
      else map.set(name, value);
    }
  return [...map].map(([k, v]) => `${k}=${v}`).join("; ");
}

type Route = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;
function mockFetch(route: Route) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = route(String(url), init);
    if (!r) return new Response(JSON.stringify({ error: "not_mocked" }), { status: 500 });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
  return calls;
}

const GOOGLE_TOKEN = { access_token: "ya29.SECRET-ACCESS", refresh_token: "1//SECRET-REFRESH", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly" };
const googleRoute: Route = (url) => {
  if (url.startsWith("https://oauth2.googleapis.com/token")) return { body: GOOGLE_TOKEN };
  if (url.includes("/calendarList")) return { body: { items: [{ id: "me@example.com", summary: "Me", primary: true, backgroundColor: "#123456" }, { id: "work@example.com", summary: "Work" }] } };
  if (url.includes("/events?")) return { body: { items: [{ id: "e1", summary: "Standup", start: { dateTime: "2026-10-14T13:00:00Z" }, end: { dateTime: "2026-10-14T13:15:00Z" } }] } };
  if (url.startsWith("https://oauth2.googleapis.com/revoke")) return { body: {} };
  return undefined;
};

async function connectGoogle(cookieHeader = "") {
  const connect = await handleConnect(new Request(`${BASE}/api/integrations/google/connect`, { headers: { cookie: cookieHeader } }), "google");
  const loc = new URL(connect.headers.get("location")!);
  const cookies = jar(connect, ...(cookieHeader ? [] : []));
  const cookieAll = [cookieHeader, cookies].filter(Boolean).join("; ");
  const cb = await handleCallback(new Request(`${BASE}/api/integrations/google/callback?code=4/abc&state=${loc.searchParams.get("state")}`, { headers: { cookie: cookieAll } }), "google");
  return { connect, loc, cb, cookie: cookieAll };
}

let store: MemoryStore;
const dump = () => (store as unknown as { data: { connections: { ownerId: string }[]; runs: { action: string }[] } }).data;
beforeEach(() => {
  setEnv();
  store = new MemoryStore();
  setStoreForTests(store);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  setStoreForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("crypto & config", () => {
  it("encrypts with AES-GCM and rejects tampering or a different owner binding", () => {
    const key = loadKey(KEY_B64)!;
    const blob = encrypt(key, "secret-token", "owner-a:google");
    expect(blob).not.toContain("secret-token");
    expect(decrypt(key, blob, "owner-a:google")).toBe("secret-token");
    expect(() => decrypt(key, blob, "owner-b:google")).toThrow();
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(key, parts.join("."), "owner-a:google")).toThrow();
    expect(loadKey("too-short")).toBeNull();
  });
  it("validates the base URL and required secrets", () => {
    expect(coreConfig().ok).toBe(true);
    expect(coreConfig({ ...process.env, APP_BASE_URL: "http://evil.example.com" }).ok).toBe(false);
    expect(coreConfig({ ...process.env, APP_BASE_URL: "http://localhost:3000" }).ok).toBe(true);
    expect(coreConfig({ ...process.env, APP_BASE_URL: `${BASE}/path` }).ok).toBe(false);
    expect(coreConfig({ ...process.env, SESSION_SECRET: "short" }).problems.length).toBe(1);
    expect(coreConfig({ APP_BASE_URL: BASE } as unknown as NodeJS.ProcessEnv).missing).toEqual(["SESSION_SECRET", "INTEGRATIONS_ENCRYPTION_KEY"]);
  });
  it("rejects forged session cookies", () => {
    expect(verifySessionValue(`${"a".repeat(43)}.forged`, "s".repeat(40))).toBeNull();
  });
});

describe("OAuth state (CSRF + PKCE)", () => {
  const key = loadKey(KEY_B64)!;
  it("accepts the matching state once and rejects every mismatch", () => {
    const st = createState({ provider: "google", sessionId: "sid1", usePkce: true, key, now: 1000 });
    expect(st.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ok = validateState({ cookieValue: st.cookieValue, stateParam: st.state, provider: "google", sessionId: "sid1", key, now: 2000 });
    expect(ok.ok && ok.verifier?.length).toBeGreaterThanOrEqual(43);
    const bad = (o: Partial<Parameters<typeof validateState>[0]>) => validateState({ cookieValue: st.cookieValue, stateParam: st.state, provider: "google", sessionId: "sid1", key, now: 2000, ...o });
    expect(bad({ stateParam: "other" })).toEqual({ ok: false, reason: "state_mismatch" });
    expect(bad({ provider: "notion" })).toEqual({ ok: false, reason: "provider_mismatch" });
    expect(bad({ sessionId: "sid2" })).toEqual({ ok: false, reason: "session_mismatch" });
    expect(bad({ now: 1000 + 601_000 })).toEqual({ ok: false, reason: "expired" });
    expect(bad({ cookieValue: st.cookieValue.slice(0, -4) + "AAAA" })).toEqual({ ok: false, reason: "tampered" });
    expect(bad({ cookieValue: null })).toEqual({ ok: false, reason: "missing" });
  });
});

describe("status & configuration", () => {
  it("reports 'requires configuration' without leaking anything when env is missing", async () => {
    setEnv({ SESSION_SECRET: undefined, GOOGLE_CLIENT_ID: undefined });
    const res = await handleStatus(new Request(`${BASE}/api/integrations/status`));
    const body = await res.json();
    expect(body.core.ok).toBe(false);
    expect(body.providers.find((p: { provider: string }) => p.provider === "google").configured).toBe(false);
    expect(JSON.stringify(body)).not.toContain("gsecret");
  });
  it("redirects back with an error when a provider isn't configured", async () => {
    setEnv({ NOTION_CLIENT_ID: undefined });
    const res = await handleConnect(new Request(`${BASE}/api/integrations/notion/connect`), "notion");
    expect(res.headers.get("location")).toBe(`${BASE}/settings/integrations?error=config&provider=notion`);
  });
  it("rejects unknown providers", async () => {
    expect((await handleConnect(new Request(`${BASE}/x`), "cocos")).status).toBe(404);
  });
});

describe("Google OAuth flow", () => {
  it("redirects to Google with read-only scopes, PKCE and a state cookie", async () => {
    const res = await handleConnect(new Request(`${BASE}/api/integrations/google/connect`), "google");
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${BASE}/api/integrations/google/callback`);
    expect(loc.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    expect(loc.searchParams.get("client_secret")).toBeNull();
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain(`${STATE_COOKIE}=`);
    expect(cookies).toMatch(/HttpOnly; SameSite=Lax; Secure/);
  });

  it("connects only after token exchange and verification, storing tokens encrypted", async () => {
    const calls = mockFetch(googleRoute);
    const { cb, cookie } = await connectGoogle();
    expect(cb.headers.get("location")).toBe(`${BASE}/settings/integrations?connected=google`);
    const tokenCall = calls.find((c) => c.url.includes("oauth2.googleapis.com/token"))!;
    expect(String(tokenCall.init?.body)).toContain("code_verifier=");
    const [rec] = await store.list(dump().connections[0].ownerId);
    expect(rec.status).toBe("connected");
    expect(rec.accountLabel).toBe("me@example.com");
    expect(rec.tokens).not.toMatch(/SECRET-ACCESS|SECRET-REFRESH/);
    expect(openTokens(loadKey(KEY_B64)!, rec).accessToken).toBe("ya29.SECRET-ACCESS");
    const status = await (await handleStatus(new Request(`${BASE}/api/integrations/status`, { headers: { cookie } }))).text();
    expect(status).toContain('"status":"connected"');
    expect(status).not.toMatch(/SECRET-ACCESS|SECRET-REFRESH|gsecret/);
  });

  it("rejects a forged or replayed state without contacting Google", async () => {
    const calls = mockFetch(googleRoute);
    const connect = await handleConnect(new Request(`${BASE}/api/integrations/google/connect`), "google");
    const cb = await handleCallback(new Request(`${BASE}/api/integrations/google/callback?code=x&state=forged`, { headers: { cookie: jar(connect) } }), "google");
    expect(cb.headers.get("location")).toContain("error=state");
    expect(calls.length).toBe(0);
    // Callback without the state cookie (e.g. different browser) is also rejected.
    const loc = new URL(connect.headers.get("location")!);
    const cb2 = await handleCallback(new Request(`${BASE}/api/integrations/google/callback?code=x&state=${loc.searchParams.get("state")}`), "google");
    expect(cb2.headers.get("location")).toContain("error=state");
  });

  it("handles a denied consent screen and partial scope grants", async () => {
    mockFetch((url) => (url.includes("/token") ? { body: { ...GOOGLE_TOKEN, scope: "https://www.googleapis.com/auth/calendar.calendarlist.readonly" } } : googleRoute(url)));
    const connect = await handleConnect(new Request(`${BASE}/api/integrations/google/connect`), "google");
    const state = new URL(connect.headers.get("location")!).searchParams.get("state");
    const denied = await handleCallback(new Request(`${BASE}/api/integrations/google/callback?error=access_denied&state=${state}`, { headers: { cookie: jar(connect) } }), "google");
    expect(denied.headers.get("location")).toContain("error=denied");
    const partial = await handleCallback(new Request(`${BASE}/api/integrations/google/callback?code=c&state=${state}`, { headers: { cookie: jar(connect) } }), "google");
    expect(partial.headers.get("location")).toContain("error=scope");
    expect(dump().connections).toHaveLength(0);
  });

  it("does not store a connection when verification fails", async () => {
    mockFetch((url) => (url.includes("/calendarList") ? { status: 500, body: {} } : googleRoute(url)));
    const { cb } = await connectGoogle();
    expect(cb.headers.get("location")).toContain("error=verify");
    expect(dump().connections).toHaveLength(0);
  });
});

describe("sync, refresh, isolation and disconnect", () => {
  const post = (url: string, cookie: string, body: unknown, headers: Record<string, string> = { "x-life-os": "1", origin: BASE }) =>
    new Request(url, { method: "POST", headers: { cookie, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("syncs selected calendars in the user's timezone and requires CSRF headers", async () => {
    mockFetch(googleRoute);
    const { cookie } = await connectGoogle();
    const body = { from: "2026-10-01", to: "2026-10-31", tz: "America/New_York", calendarIds: ["me@example.com", "not-mine@example.com"] };
    expect((await handleSync(post(`${BASE}/api/integrations/google/sync`, cookie, body, {}), "google")).status).toBe(403);
    expect((await handleSync(post(`${BASE}/api/integrations/google/sync`, cookie, body, { "x-life-os": "1", origin: "https://evil.example" }), "google")).status).toBe(403);
    const res = await handleSync(post(`${BASE}/api/integrations/google/sync`, cookie, body), "google");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.calendars).toEqual(["me@example.com"]);
    expect(data.events[0]).toMatchObject({ title: "Standup", date: "2026-10-14", startTime: "09:00", endTime: "09:15", provider: "google" });
  });

  it("keeps each session's connections isolated", async () => {
    mockFetch(googleRoute);
    const a = await connectGoogle();
    const statusB = await handleStatus(new Request(`${BASE}/api/integrations/status`));
    const cookieB = jar(statusB);
    expect(cookieB).not.toBe(a.cookie);
    const bodyB = await statusB.json();
    expect(bodyB.providers.find((p: { provider: string }) => p.provider === "google").connection).toBeNull();
    const syncB = await handleSync(post(`${BASE}/api/integrations/google/sync`, cookieB, { from: "2026-10-01", to: "2026-10-02", tz: "UTC", calendarIds: ["me@example.com"] }), "google");
    expect(syncB.status).toBe(401);
  });

  it("refreshes an expired access token and marks the connection expired when refresh is refused", async () => {
    mockFetch(googleRoute);
    const { cookie } = await connectGoogle();
    const ownerId = dump().connections[0].ownerId;
    const key = loadKey(KEY_B64)!;
    const rec = (await store.get(ownerId, "google"))!;
    const expired = { ...openTokens(key, rec), expiresAt: Date.now() - 1000 };
    await store.patch(ownerId, "google", { tokens: sealTokens(key, ownerId, "google", expired) });

    const calls = mockFetch((url, init) => (url.includes("/token") ? { body: { access_token: "ya29.NEW", expires_in: 3600, scope: GOOGLE_TOKEN.scope } } : url.includes("/events?") ? (String((init?.headers as Record<string, string>)?.authorization).includes("ya29.NEW") ? googleRoute(url) : { status: 401, body: {} }) : googleRoute(url)));
    const ok = await handleSync(post(`${BASE}/api/integrations/google/sync`, cookie, { from: "2026-10-01", to: "2026-10-31", tz: "UTC", calendarIds: ["me@example.com"] }), "google");
    expect(ok.status).toBe(200);
    expect(calls.some((c) => String(c.init?.body).includes("grant_type=refresh_token"))).toBe(true);
    const after = openTokens(key, (await store.get(ownerId, "google"))!);
    expect(after.accessToken).toBe("ya29.NEW");
    expect(after.refreshToken).toBe("1//SECRET-REFRESH"); // Google omits it on refresh; the old one is kept

    await store.patch(ownerId, "google", { tokens: sealTokens(key, ownerId, "google", { ...after, expiresAt: Date.now() - 1 }) });
    mockFetch((url) => (url.includes("/token") ? { status: 400, body: { error: "invalid_grant" } } : googleRoute(url)));
    const fail = await handleSync(post(`${BASE}/api/integrations/google/sync`, cookie, { from: "2026-10-01", to: "2026-10-31", tz: "UTC", calendarIds: [] }), "google");
    expect(fail.status).toBe(401);
    expect((await fail.json()).error).toBe("invalid_grant");
    expect((await store.get(ownerId, "google"))!.status).toBe("expired");
  });

  it("marks the connection expired when the provider rejects stored credentials and refresh isn't possible", async () => {
    mockFetch(googleRoute);
    const { cookie } = await connectGoogle();
    const ownerId = dump().connections[0].ownerId;
    const key = loadKey(KEY_B64)!;
    const t = openTokens(key, (await store.get(ownerId, "google"))!);
    await store.patch(ownerId, "google", { tokens: sealTokens(key, ownerId, "google", { ...t, refreshToken: null }) });
    mockFetch((url) => (url.includes("/calendarList") ? { status: 401, body: {} } : undefined));
    const res = await handleSync(post(`${BASE}/api/integrations/google/sync`, cookie, { from: "2026-10-01", to: "2026-10-02", tz: "UTC", calendarIds: [] }), "google");
    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/expired or was revoked/);
    expect((await store.get(ownerId, "google"))!.status).toBe("expired");
  });

  it("validates sync input", async () => {
    mockFetch(googleRoute);
    const { cookie } = await connectGoogle();
    const bad = await handleSync(post(`${BASE}/api/integrations/google/sync`, cookie, { from: "2026-10-01", to: "2028-10-01", tz: "Mars/Base" }), "google");
    expect(bad.status).toBe(400);
  });

  it("disconnects: revokes at Google and deletes server credentials", async () => {
    const calls = mockFetch(googleRoute);
    const { cookie } = await connectGoogle();
    expect((await handleDisconnect(post(`${BASE}/api/integrations/google/disconnect`, cookie, {}, {}), "google")).status).toBe(403);
    const res = await handleDisconnect(post(`${BASE}/api/integrations/google/disconnect`, cookie, {}), "google");
    expect(await res.json()).toEqual({ ok: true, revoked: true, wasConnected: true });
    expect(calls.some((c) => c.url.startsWith("https://oauth2.googleapis.com/revoke"))).toBe(true);
    expect(dump().connections).toHaveLength(0);
    expect(dump().runs.map((r) => r.action)).toEqual(["connect", "disconnect"]);
  });
});

describe("Mercado Pago", () => {
  const mpRoute: Route = (url) => {
    if (url === "https://api.mercadopago.com/oauth/token") return { body: { access_token: "APP_USR-SECRET", refresh_token: "TG-SECRET", expires_in: 15552000, user_id: 777, scope: "read offline_access" } };
    if (url === "https://api.mercadopago.com/users/me") return { body: { id: 777, nickname: "SAMUEL" } };
    if (url.startsWith("https://api.mercadopago.com/v1/payments/search")) return { body: { paging: { total: 2 }, results: [
      { id: 1, date_approved: "2026-10-10T15:00:00.000-03:00", transaction_amount: 1500.5, currency_id: "ARS", description: "Logo design", status: "approved", collector_id: 777, payer: { id: 9 }, fee_details: [{ amount: 90.03, type: "mercadopago_fee" }] },
      { id: 2, date_created: "2026-10-11T10:00:00.000-03:00", transaction_amount: 200, currency_id: "ARS", description: "Coffee", status: "approved", collector_id: 5, payer: { id: 777 } },
    ] } };
    return undefined;
  };

  it("enforces the 3-provider limit before redirecting to Mercado Pago", async () => {
    const res = await handleConnect(new Request(`${BASE}/api/integrations/mercadopago/connect?localActive=3`), "mercadopago");
    expect(res.headers.get("location")).toBe(`${BASE}/settings/integrations?error=limit&provider=mercadopago`);
    const ok = await handleConnect(new Request(`${BASE}/api/integrations/mercadopago/connect?localActive=2`), "mercadopago");
    const loc = new URL(ok.headers.get("location")!);
    expect(loc.origin).toBe("https://auth.mercadopago.com");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("connects, verifies the account and returns direction-aware records with fees", async () => {
    const calls = mockFetch(mpRoute);
    const connect = await handleConnect(new Request(`${BASE}/api/integrations/mercadopago/connect`), "mercadopago");
    const state = new URL(connect.headers.get("location")!).searchParams.get("state");
    const cookie = jar(connect);
    const cb = await handleCallback(new Request(`${BASE}/api/integrations/mercadopago/callback?code=TG-code&state=${state}`, { headers: { cookie } }), "mercadopago");
    expect(cb.headers.get("location")).toContain("connected=mercadopago");
    const exchange = JSON.parse(String(calls.find((c) => c.url.endsWith("/oauth/token"))!.init!.body));
    expect(exchange).toMatchObject({ grant_type: "authorization_code", code: "TG-code", redirect_uri: `${BASE}/api/integrations/mercadopago/callback` });
    expect(exchange.code_verifier).toBeTruthy();
    const res = await handleSync(new Request(`${BASE}/api/integrations/mercadopago/sync`, { method: "POST", headers: { cookie, "x-life-os": "1", origin: BASE }, body: JSON.stringify({ from: "2026-10-01", to: "2026-10-14", tz: "America/Argentina/Buenos_Aires" }) }), "mercadopago");
    const data = await res.json();
    expect(data.records).toEqual([
      expect.objectContaining({ externalId: "mp:1", date: "2026-10-10", signedAmount: 150050, fee: 9003, currency: "ARS", providerStatus: "approved" }),
      expect.objectContaining({ externalId: "mp:2", date: "2026-10-11", signedAmount: -20000, fee: null }),
    ]);
  });
});

describe("Supabase store", () => {
  it("scopes every query to the owner and keeps ciphertext in a separate table", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST" && url.includes("integration_accounts")) return new Response(JSON.stringify([{ id: "acc-1" }]), { status: 201 });
      if (!init?.method) return new Response(JSON.stringify([]), { status: 200 });
      return new Response(null, { status: 204 });
    });
    const s = new SupabaseStore("https://x.supabase.co", "service-key", f as unknown as typeof fetch);
    await s.list("owner a");
    expect(calls[0].url).toContain("integration_accounts?owner_id=eq.owner%20a");
    await s.put({ ownerId: "o1", provider: "google", status: "connected", accountLabel: null, externalAccountId: null, scopes: [], connectedAt: "", lastVerifiedAt: null, lastSyncAt: null, lastError: null, tokens: "v1.cipher", tokenExpiresAt: null });
    expect(calls[1].url).toContain("integration_accounts?on_conflict=owner_id,provider");
    expect(String(calls[1].init?.body)).not.toContain("cipher");
    expect(calls[2].url).toContain("integration_tokens");
    expect(String(calls[2].init?.body)).toContain("v1.cipher");
  });
});

describe("audit logging", () => {
  it("redacts secrets but keeps error codes", async () => {
    const { safeLog } = await import("@/lib/server/http");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    safeLog("x", { errorCode: "invalid_grant", code: "4/abc", accessToken: "ya29", client_secret: "s", provider: "google" });
    const line = JSON.parse(String(spy.mock.calls.at(-1)![0]));
    expect(line).toMatchObject({ errorCode: "invalid_grant", code: "[redacted]", accessToken: "[redacted]", client_secret: "[redacted]", provider: "google" });
  });
});
