import { call, form, ProviderError, type OAuthAdapter, type TokenSet } from "./types";
import { normalizeGoogleEvents, type GoogleEvent } from "../../integrations/normalize";
import type { ExternalEvent } from "../../domain/types";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

/** Narrowest scopes for listing calendars and reading events. No write access. */
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events.readonly"];

function toTokens(t: any, prev?: TokenSet): TokenSet { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!t?.access_token) throw new ProviderError("bad_response", "No access token in response");
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? prev?.refreshToken ?? null,
    expiresAt: typeof t.expires_in === "number" ? Date.now() + t.expires_in * 1000 : null,
    scopes: typeof t.scope === "string" ? t.scope.split(" ") : prev?.scopes ?? [],
    extra: prev?.extra ?? {},
  };
}

export interface GoogleCalendar {
  id: string;
  name: string;
  color: string;
  primary: boolean;
}

export const google: OAuthAdapter & {
  calendars(tokens: TokenSet): Promise<GoogleCalendar[]>;
  events(tokens: TokenSet, cals: GoogleCalendar[], from: string, to: string, tz: string): Promise<ExternalEvent[]>;
} = {
  id: "google",
  usesPkce: true,
  scopes: GOOGLE_SCOPES,
  buildAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
    const u = new URL(AUTH);
    u.search = form({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state,
      ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: "S256" } : {}),
    });
    return u.toString();
  },
  async exchangeCode({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
    const t = await call(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", ...(codeVerifier ? { code_verifier: codeVerifier } : {}) }) });
    const tokens = toTokens(t);
    // Google's granular consent lets users untick scopes: require both.
    const missing = GOOGLE_SCOPES.filter((s) => !tokens.scopes.includes(s));
    if (missing.length) throw new ProviderError("insufficient_scope", "Calendar list and event read access are both required");
    return tokens;
  },
  async refresh({ clientId, clientSecret, tokens }) {
    if (!tokens.refreshToken) throw new ProviderError("invalid_grant", "No refresh token");
    const t = await call(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refreshToken, grant_type: "refresh_token" }) });
    return toTokens(t, tokens);
  },
  async verify(tokens) {
    const cals = await google.calendars(tokens);
    const primary = cals.find((c) => c.primary) ?? cals[0];
    if (!primary) throw new ProviderError("bad_response", "No calendars returned");
    return { externalAccountId: primary.id, label: primary.id };
  },
  async revoke({ tokens }) {
    await call(REVOKE, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ token: tokens.refreshToken ?? tokens.accessToken }) });
    return true;
  },
  async calendars(tokens) {
    const out: GoogleCalendar[] = [];
    let pageToken = "";
    for (let i = 0; i < 5; i++) {
      const r = await call(`${API}/users/me/calendarList?maxResults=250&minAccessRole=reader${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
      for (const c of r?.items ?? []) out.push({ id: String(c.id), name: String(c.summaryOverride ?? c.summary ?? c.id), color: String(c.backgroundColor ?? "#1A73E8"), primary: !!c.primary });
      pageToken = r?.nextPageToken ?? "";
      if (!pageToken) break;
    }
    return out;
  },
  async events(tokens, cals, from, to, tz) {
    const seen = new Set<string>();
    const out: ExternalEvent[] = [];
    // Window edges padded by a day so events near midnight in other zones aren't lost.
    const timeMin = new Date(`${from}T00:00:00Z`).getTime() - 864e5;
    const timeMax = new Date(`${to}T23:59:59Z`).getTime() + 864e5;
    for (const cal of cals) {
      let pageToken = "";
      for (let i = 0; i < 10; i++) {
        const qs = form({ singleEvents: "true", orderBy: "startTime", maxResults: "250", timeMin: new Date(timeMin).toISOString(), timeMax: new Date(timeMax).toISOString(), ...(pageToken ? { pageToken } : {}) });
        const r = await call(`${API}/calendars/${encodeURIComponent(cal.id)}/events?${qs}`, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
        out.push(...normalizeGoogleEvents((r?.items ?? []) as GoogleEvent[], cal, tz, seen));
        pageToken = r?.nextPageToken ?? "";
        if (!pageToken) break;
      }
    }
    return out.filter((e) => e.endDate >= from && e.date <= to);
  },
};
