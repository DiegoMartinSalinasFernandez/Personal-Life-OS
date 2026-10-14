import { call, form, ProviderError, type OAuthAdapter, type TokenSet } from "./types";
import { normalizeMPPayments, type MPPayment } from "../../integrations/normalize";
import type { RawRecord } from "../../integrations/importer";

const API = "https://api.mercadopago.com";

function toTokens(t: any, prev?: TokenSet): TokenSet { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!t?.access_token) throw new ProviderError("bad_response", "No access token in response");
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? prev?.refreshToken ?? null,
    expiresAt: typeof t.expires_in === "number" ? Date.now() + t.expires_in * 1000 : null,
    scopes: typeof t.scope === "string" ? t.scope.split(" ") : prev?.scopes ?? [],
    extra: { ...(prev?.extra ?? {}), ...(t.user_id != null ? { userId: String(t.user_id) } : {}) },
  };
}

export function mercadoPagoAdapter(opts: { authHost: string; usePkce: boolean }): OAuthAdapter & { payments(tokens: TokenSet, from: string, to: string, tz: string): Promise<RawRecord[]> } {
  return {
    id: "mercadopago",
    usesPkce: opts.usePkce,
    scopes: ["read", "offline_access"],
    buildAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
      const u = new URL(`${opts.authHost}/authorization`);
      u.search = form({ client_id: clientId, response_type: "code", platform_id: "mp", state, redirect_uri: redirectUri, ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: "S256" } : {}) });
      return u.toString();
    },
    async exchangeCode({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
      const t = await call(`${API}/oauth/token`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri, ...(codeVerifier ? { code_verifier: codeVerifier } : {}) }) });
      return toTokens(t);
    },
    async refresh({ clientId, clientSecret, tokens }) {
      if (!tokens.refreshToken) throw new ProviderError("invalid_grant", "No refresh token");
      // Mercado Pago rotates refresh tokens: the new one must replace the old one.
      const t = await call(`${API}/oauth/token`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: tokens.refreshToken }) });
      return toTokens(t, tokens);
    },
    async verify(tokens) {
      const me = await call(`${API}/users/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
      if (!me?.id) throw new ProviderError("bad_response", "Account could not be identified");
      return { externalAccountId: String(me.id), label: String(me.nickname ?? me.email ?? me.id) };
    },
    // No documented revocation endpoint: the user removes the app in Mercado Pago's security settings.
    async payments(tokens, from, to, tz) {
      const userId = tokens.extra.userId;
      if (!userId) throw new ProviderError("bad_response", "Missing account id — reconnect Mercado Pago");
      const all: MPPayment[] = [];
      for (let offset = 0; offset < 1000; offset += 50) {
        const qs = form({ sort: "date_created", criteria: "desc", range: "date_created", begin_date: `${from}T00:00:00.000Z`, end_date: `${to}T23:59:59.999Z`, limit: "50", offset: String(offset) });
        const r = await call(`${API}/v1/payments/search?${qs}`, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
        const items = (r?.results ?? []) as MPPayment[];
        all.push(...items);
        const total = Number(r?.paging?.total ?? 0);
        if (items.length < 50 || offset + 50 >= total) break;
      }
      return normalizeMPPayments(all, userId, tz);
    },
  };
}
