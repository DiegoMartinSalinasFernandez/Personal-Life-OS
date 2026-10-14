/**
 * Integration request handlers. Route files under src/app/api/integrations
 * delegate here so the logic can be unit-tested with plain Request objects.
 *
 * Guarantees:
 * - tokens are exchanged, refreshed and stored only on the server (AES-GCM, bound to owner+provider)
 * - responses never contain tokens or client secrets
 * - "connected" is stored only after the token exchange AND a verification call succeed
 * - every state-changing POST requires same-origin + custom header (CSRF)
 * - OAuth state is single-use, encrypted, session-bound and expires after 10 minutes
 */
import { MAX_FINANCE_CONNECTIONS, OAUTH_PROVIDERS, isOAuthProvider, providerInfo, type OAuthProviderId, type ServerProviderState } from "../integrations/catalog";
import { isISODate, diffDays } from "../domain/dates";
import { coreConfig, providerCredentials, redirectUri, type CoreConfig } from "./env";
import { decrypt, encrypt, randomToken } from "./crypto";
import { checkSameOrigin, cookie, json, readCookie, redirect, safeLog, withCookies } from "./http";
import { getSession } from "./session";
import { createState, STATE_COOKIE, validateState } from "./oauth-state";
import { getStore, toPublic, type ConnectionRecord, type CredentialStore } from "./store";
import { adapterFor, google, notion, mercadoPagoAdapter, ProviderError, type OAuthAdapter, type TokenSet } from "./providers";
import { mercadoPagoOptions } from "./env";

const RETURN_PATH = "/settings/integrations";

const aad = (ownerId: string, provider: string) => `${ownerId}:${provider}`;
export const sealTokens = (key: Buffer, ownerId: string, provider: string, t: TokenSet) => encrypt(key, JSON.stringify(t), aad(ownerId, provider));
export const openTokens = (key: Buffer, rec: ConnectionRecord): TokenSet => JSON.parse(decrypt(key, rec.tokens, aad(rec.ownerId, rec.provider)));

function back(cfg: CoreConfig, params: Record<string, string>, cookies: string[] = []) {
  const base = cfg.baseUrl ?? "";
  return redirect(`${base}${RETURN_PATH}?${new URLSearchParams(params)}`, cookies);
}

async function logRun(store: CredentialStore, ownerId: string, provider: string, action: "connect" | "verify" | "sync" | "refresh" | "disconnect", started: number, ok: boolean, itemCount = 0, errorCode: string | null = null) {
  const run = { id: randomToken(12), ownerId, provider, action, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), ok, itemCount, errorCode };
  try {
    await store.logRun(run);
  } catch {
    /* audit logging must never break the request */
  }
  safeLog("integration.run", { provider, action, ok, itemCount, errorCode });
}

const financeConnections = async (store: CredentialStore, ownerId: string, except?: string) =>
  (await store.list(ownerId)).filter((c) => providerInfo(c.provider)?.group === "finance" && c.provider !== except).length;

// ───────────────────────── GET /api/integrations/status ─────────────────────────

export async function handleStatus(req: Request): Promise<Response> {
  const cfg = coreConfig();
  const providers: ServerProviderState[] = OAUTH_PROVIDERS.map((p) => {
    const creds = providerCredentials(p);
    return { provider: p, configured: cfg.ok && creds.configured, missing: [...cfg.missing, ...creds.missing], connection: null };
  });
  if (!cfg.ok) return json({ core: { ok: false, missing: cfg.missing, problems: cfg.problems, store: cfg.store }, providers });
  const session = getSession(req, cfg);
  let connections: ConnectionRecord[] = [];
  try {
    connections = await getStore(cfg).list(session.id!);
  } catch {
    return json({ core: { ok: false, missing: [], problems: ["The credential store could not be read"], store: cfg.store }, providers }, 503);
  }
  for (const p of providers) {
    const rec = connections.find((c) => c.provider === p.provider);
    p.connection = rec ? toPublic(rec) : null;
  }
  return withCookies(json({ core: { ok: true, missing: [], problems: [], store: cfg.store }, providers, limit: MAX_FINANCE_CONNECTIONS }), [session.setCookie]);
}

// ───────────────────────── GET /api/integrations/:provider/connect ─────────────────────────

export async function handleConnect(req: Request, provider: string): Promise<Response> {
  const cfg = coreConfig();
  if (!isOAuthProvider(provider)) return json({ error: "unsupported_provider" }, 404);
  if (!cfg.ok) return back(cfg, { error: "config", provider });
  const creds = providerCredentials(provider);
  if (!creds.configured) return back(cfg, { error: "config", provider });
  const session = getSession(req, cfg);
  const store = getStore(cfg);
  if (providerInfo(provider)?.group === "finance") {
    // Server-side limit check; the client also reports its active CSV-only sources (can only make the check stricter).
    const localActive = Math.min(MAX_FINANCE_CONNECTIONS, Math.max(0, Number(new URL(req.url).searchParams.get("localActive")) || 0));
    if ((await financeConnections(store, session.id!, provider)) + localActive >= MAX_FINANCE_CONNECTIONS) return back(cfg, { error: "limit", provider }, session.setCookie ? [session.setCookie] : []);
  }
  const adapter = adapterFor(provider);
  const st = createState({ provider, sessionId: session.id!, usePkce: adapter.usesPkce, key: cfg.key! });
  const url = adapter.buildAuthUrl({ clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri: redirectUri(cfg.baseUrl!, provider), state: st.state, codeChallenge: st.challenge });
  safeLog("integration.authorize_redirect", { provider });
  return redirect(url, [cookie(STATE_COOKIE, st.cookieValue, { maxAge: 600, path: "/api/integrations", secure: cfg.secureCookies }), ...(session.setCookie ? [session.setCookie] : [])]);
}

// ───────────────────────── GET /api/integrations/:provider/callback ─────────────────────────

export async function handleCallback(req: Request, provider: string): Promise<Response> {
  const cfg = coreConfig();
  if (!isOAuthProvider(provider)) return json({ error: "unsupported_provider" }, 404);
  if (!cfg.ok) return back(cfg, { error: "config", provider });
  const clearState = cookie(STATE_COOKIE, "", { maxAge: 0, path: "/api/integrations", secure: cfg.secureCookies });
  const url = new URL(req.url);
  const session = getSession(req, cfg, false);
  const check = validateState({ cookieValue: readCookie(req, STATE_COOKIE), stateParam: url.searchParams.get("state"), provider, sessionId: session.id, key: cfg.key! });
  if (!check.ok) {
    safeLog("integration.state_rejected", { provider, reason: check.reason });
    return back(cfg, { error: "state", provider }, [clearState]);
  }
  if (url.searchParams.get("error")) return back(cfg, { error: "denied", provider }, [clearState]);
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return back(cfg, { error: "denied", provider }, [clearState]);

  const creds = providerCredentials(provider);
  if (!creds.configured) return back(cfg, { error: "config", provider }, [clearState]);
  const store = getStore(cfg);
  const ownerId = session.id!;
  const adapter = adapterFor(provider);
  const started = Date.now();
  const ctx = { clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri: redirectUri(cfg.baseUrl!, provider) };
  let tokens: TokenSet;
  try {
    tokens = await adapter.exchangeCode({ ...ctx, code, codeVerifier: check.verifier });
  } catch (e) {
    const codeErr = e instanceof ProviderError ? e.code : "provider_error";
    await logRun(store, ownerId, provider, "connect", started, false, 0, codeErr);
    return back(cfg, { error: codeErr === "insufficient_scope" ? "scope" : "exchange", provider }, [clearState]);
  }
  let identity: { externalAccountId: string; label: string };
  try {
    identity = await adapter.verify(tokens);
  } catch (e) {
    await logRun(store, ownerId, provider, "verify", started, false, 0, e instanceof ProviderError ? e.code : "provider_error");
    await adapter.revoke?.({ ...ctx, tokens }).catch(() => false);
    return back(cfg, { error: "verify", provider }, [clearState]);
  }
  if (providerInfo(provider)?.group === "finance" && (await financeConnections(store, ownerId, provider)) >= MAX_FINANCE_CONNECTIONS) {
    await adapter.revoke?.({ ...ctx, tokens }).catch(() => false);
    return back(cfg, { error: "limit", provider }, [clearState]);
  }
  const now = new Date().toISOString();
  await store.put({
    ownerId,
    provider,
    status: "connected",
    accountLabel: identity.label,
    externalAccountId: identity.externalAccountId,
    scopes: tokens.scopes.length ? tokens.scopes : adapter.scopes,
    connectedAt: now,
    lastVerifiedAt: now,
    lastSyncAt: null,
    lastError: null,
    tokens: sealTokens(cfg.key!, ownerId, provider, tokens),
    tokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
  });
  await logRun(store, ownerId, provider, "connect", started, true);
  return back(cfg, { connected: provider }, [clearState]);
}

// ───────────────────────── token lifecycle ─────────────────────────

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Runs `fn` with a valid access token: refreshes ahead of expiry, and retries
 * once after a 401. An invalid refresh grant marks the connection "expired".
 */
export async function withTokens<T>(opts: { cfg: CoreConfig; store: CredentialStore; ownerId: string; provider: OAuthProviderId; adapter: OAuthAdapter; now?: number }, fn: (t: TokenSet) => Promise<T>): Promise<T> {
  const { cfg, store, ownerId, provider, adapter } = opts;
  const rec = await store.get(ownerId, provider);
  if (!rec) throw new ProviderError("not_connected", "Not connected");
  if (rec.status === "expired") throw new ProviderError("invalid_grant", "Connection expired — reconnect");
  let tokens = openTokens(cfg.key!, rec);
  const creds = providerCredentials(provider);
  const ctx = { clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri: redirectUri(cfg.baseUrl!, provider) };

  const refresh = async () => {
    if (!adapter.refresh || !tokens.refreshToken) throw new ProviderError("invalid_grant", "Session expired and can't be refreshed");
    const started = Date.now();
    try {
      tokens = await adapter.refresh({ ...ctx, tokens });
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : "provider_error";
      if (code === "invalid_grant" || code === "unauthorized") await store.patch(ownerId, provider, { status: "expired", lastError: { code: "expired", message: "The provider no longer accepts this authorization. Reconnect to continue.", at: new Date().toISOString() } });
      await logRun(store, ownerId, provider, "refresh", started, false, 0, code);
      throw new ProviderError(code === "unauthorized" ? "invalid_grant" : code, "Refreshing access failed");
    }
    await store.patch(ownerId, provider, { tokens: sealTokens(cfg.key!, ownerId, provider, tokens), tokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null, status: "connected" });
    await logRun(store, ownerId, provider, "refresh", started, true);
  };

  if (tokens.expiresAt && tokens.expiresAt - (opts.now ?? Date.now()) < REFRESH_MARGIN_MS) await refresh();
  const markRejected = async () => {
    await store.patch(ownerId, provider, { status: "expired", lastError: { code: "expired", message: "The provider rejected the stored authorization. Reconnect to continue.", at: new Date().toISOString() } });
    return new ProviderError("invalid_grant", "The provider rejected the stored authorization");
  };
  try {
    return await fn(tokens);
  } catch (e) {
    if (!(e instanceof ProviderError) || e.code !== "unauthorized") throw e;
    if (!adapter.refresh || !tokens.refreshToken) throw await markRejected();
    await refresh();
    try {
      return await fn(tokens);
    } catch (e2) {
      if (e2 instanceof ProviderError && e2.code === "unauthorized") throw await markRejected();
      throw e2;
    }
  }
}

function errorResponse(e: unknown, provider: string) {
  const code = e instanceof ProviderError ? e.code : "provider_error";
  const status = code === "invalid_grant" || code === "unauthorized" || code === "not_connected" ? 401 : code === "insufficient_scope" ? 403 : code === "rate_limited" ? 429 : 502;
  const message =
    code === "invalid_grant" ? "The connection expired or was revoked. Reconnect to continue."
    : code === "not_connected" ? "Not connected."
    : code === "unauthorized" ? "The provider rejected the request. Reconnect to continue."
    : code === "insufficient_scope" ? "The provider denied access to this data."
    : code === "rate_limited" ? "The provider is rate limiting requests. Try again later."
    : code === "network" ? "The provider could not be reached."
    : "The provider returned an unexpected response.";
  return json({ error: code, message, provider }, status);
}

function guard(req: Request) {
  const cfg = coreConfig();
  if (!cfg.ok) return { error: json({ error: "config", message: "Server integration settings are incomplete." }, 503) } as const;
  if (req.method !== "GET" && !checkSameOrigin(req, cfg)) return { error: json({ error: "forbidden", message: "Cross-site request rejected." }, 403) } as const;
  const session = getSession(req, cfg, false);
  if (!session.id) return { error: json({ error: "unauthorized", message: "No session." }, 401) } as const;
  return { cfg, ownerId: session.id, store: getStore(cfg) } as const;
}

// ───────────────────────── POST /api/integrations/:provider/disconnect ─────────────────────────

export async function handleDisconnect(req: Request, provider: string): Promise<Response> {
  if (!isOAuthProvider(provider)) return json({ error: "unsupported_provider" }, 404);
  const g = guard(req);
  if ("error" in g) return g.error!;
  const { cfg, ownerId, store } = g;
  const rec = await store.get(ownerId, provider);
  if (!rec) return json({ ok: true, revoked: false, wasConnected: false });
  const started = Date.now();
  const adapter = adapterFor(provider);
  let revoked = false;
  if (adapter.revoke) {
    try {
      const creds = providerCredentials(provider);
      revoked = await adapter.revoke({ clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri: redirectUri(cfg.baseUrl!, provider), tokens: openTokens(cfg.key!, rec) });
    } catch {
      revoked = false;
    }
  }
  await store.remove(ownerId, provider);
  await logRun(store, ownerId, provider, "disconnect", started, true, 0, revoked ? null : "not_revoked_at_provider");
  return json({ ok: true, revoked, wasConnected: true });
}

// ───────────────────────── GET /api/integrations/:provider/resources ─────────────────────────

export async function handleResources(req: Request, provider: string): Promise<Response> {
  if (provider !== "google" && provider !== "notion") return json({ error: "unsupported_provider" }, 404);
  const g = guard(req);
  if ("error" in g) return g.error!;
  try {
    const data = await withTokens({ ...g, provider, adapter: adapterFor(provider) }, (t): Promise<unknown[]> => (provider === "google" ? google.calendars(t) : notion.databases(t)));
    return json({ items: data });
  } catch (e) {
    return errorResponse(e, provider);
  }
}

// ───────────────────────── POST /api/integrations/:provider/sync ─────────────────────────

function validTz(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function handleSync(req: Request, provider: string): Promise<Response> {
  if (!isOAuthProvider(provider)) return json({ error: "unsupported_provider" }, 404);
  const g = guard(req);
  if ("error" in g) return g.error!;
  const { store, ownerId } = g;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "bad_request", message: "Invalid JSON body" }, 400);
  }
  const { from, to, tz } = body as { from: string; to: string; tz: string };
  if (!isISODate(from) || !isISODate(to) || from > to || diffDays(from, to) > 400 || !validTz(tz)) return json({ error: "bad_request", message: "Provide from/to dates (max 400 days) and a valid timezone" }, 400);
  const started = Date.now();
  try {
    let payload: Record<string, unknown>;
    let count = 0;
    if (provider === "google") {
      const ids = Array.isArray(body.calendarIds) ? (body.calendarIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 50) : [];
      payload = await withTokens({ ...g, provider, adapter: google }, async (t) => {
        // Only calendars that belong to this account are queried.
        const cals = (await google.calendars(t)).filter((c) => ids.includes(c.id));
        const events = await google.events(t, cals, from, to, tz);
        count = events.length;
        return { events, calendars: cals.map((c) => c.id) };
      });
    } else if (provider === "notion") {
      const dbs = Array.isArray(body.databases) ? (body.databases as { id?: unknown; name?: unknown; dateProperty?: unknown }[]).filter((d) => typeof d.id === "string" && typeof d.dateProperty === "string").slice(0, 10).map((d) => ({ id: d.id as string, name: String(d.name ?? "Notion"), dateProperty: d.dateProperty as string })) : [];
      payload = await withTokens({ ...g, provider, adapter: notion }, async (t) => {
        const events = await notion.entries(t, dbs, from, to, tz);
        count = events.length;
        return { events };
      });
    } else {
      const mp = mercadoPagoAdapter(mercadoPagoOptions());
      payload = await withTokens({ ...g, provider, adapter: mp }, async (t) => {
        const records = await mp.payments(t, from, to, tz);
        count = records.length;
        return { records, scope: "Payments returned by Mercado Pago's payments search for the authorized account" };
      });
    }
    const now = new Date().toISOString();
    await store.patch(ownerId, provider, { lastSyncAt: now, lastError: null, status: "connected" });
    await logRun(store, ownerId, provider, "sync", started, true, count);
    return json({ ok: true, syncedAt: now, ...payload });
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "provider_error";
    const current = await store.get(ownerId, provider).catch(() => null);
    if (current && code !== "invalid_grant" && code !== "not_connected") await store.patch(ownerId, provider, { lastError: { code, message: "Last synchronization failed", at: new Date().toISOString() } });
    await logRun(store, ownerId, provider, "sync", started, false, 0, code);
    return errorResponse(e, provider);
  }
}
