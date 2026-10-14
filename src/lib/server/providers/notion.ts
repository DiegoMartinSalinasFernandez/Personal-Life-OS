import { call, ProviderError, type OAuthAdapter, type TokenSet } from "./types";
import { normalizeNotionPages, type NotionPage } from "../../integrations/normalize";
import type { ExternalEvent } from "../../domain/types";

const API = "https://api.notion.com/v1";
/** Pinned API version: databases + /query endpoints as documented for this version. */
export const NOTION_VERSION = "2022-06-28";

const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
const headers = (t: TokenSet) => ({ authorization: `Bearer ${t.accessToken}`, "notion-version": NOTION_VERSION, "content-type": "application/json" });

function toTokens(t: any, prev?: TokenSet): TokenSet { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!t?.access_token) throw new ProviderError("bad_response", "No access token in response");
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? prev?.refreshToken ?? null,
    expiresAt: typeof t.expires_in === "number" ? Date.now() + t.expires_in * 1000 : null,
    scopes: [],
    extra: { ...(prev?.extra ?? {}), ...(t.workspace_name ? { workspace: String(t.workspace_name) } : {}), ...(t.bot_id ? { botId: String(t.bot_id) } : {}) },
  };
}

export interface NotionDatabase {
  id: string;
  name: string;
  dateProperties: string[];
}

export const notion: OAuthAdapter & {
  databases(tokens: TokenSet): Promise<NotionDatabase[]>;
  entries(tokens: TokenSet, dbs: { id: string; name: string; dateProperty: string }[], from: string, to: string, tz: string): Promise<ExternalEvent[]>;
} = {
  id: "notion",
  usesPkce: false, // Notion's OAuth uses a confidential client (Basic auth); PKCE isn't part of its documented flow.
  scopes: [],
  buildAuthUrl({ clientId, redirectUri, state }) {
    const u = new URL(`${API}/oauth/authorize`);
    u.search = new URLSearchParams({ client_id: clientId, response_type: "code", owner: "user", redirect_uri: redirectUri, state }).toString();
    return u.toString();
  },
  async exchangeCode({ clientId, clientSecret, redirectUri, code }) {
    const t = await call(`${API}/oauth/token`, { method: "POST", headers: { authorization: basic(clientId, clientSecret), "content-type": "application/json", "notion-version": NOTION_VERSION }, body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
    return toTokens(t);
  },
  async refresh({ clientId, clientSecret, tokens }) {
    if (!tokens.refreshToken) throw new ProviderError("invalid_grant", "No refresh token");
    const t = await call(`${API}/oauth/token`, { method: "POST", headers: { authorization: basic(clientId, clientSecret), "content-type": "application/json", "notion-version": NOTION_VERSION }, body: JSON.stringify({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }) });
    return toTokens(t, tokens);
  },
  async verify(tokens) {
    const me = await call(`${API}/users/me`, { headers: headers(tokens) });
    if (!me?.id) throw new ProviderError("bad_response", "Integration could not be identified");
    return { externalAccountId: tokens.extra.botId ?? String(me.id), label: tokens.extra.workspace ?? String(me.name ?? "Notion workspace") };
  },
  async databases(tokens) {
    const out: NotionDatabase[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const r = await call(`${API}/search`, { method: "POST", headers: headers(tokens), body: JSON.stringify({ filter: { property: "object", value: "database" }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }) });
      for (const d of r?.results ?? []) {
        const name = (d.title ?? []).map((t: { plain_text?: string }) => t.plain_text ?? "").join("") || "Untitled database";
        const dateProperties = Object.entries(d.properties ?? {}).filter(([, p]) => (p as { type?: string }).type === "date").map(([k]) => k);
        out.push({ id: d.id, name, dateProperties });
      }
      if (!r?.has_more) break;
      cursor = r.next_cursor;
    }
    return out;
  },
  async entries(tokens, dbs, from, to, tz) {
    const out: ExternalEvent[] = [];
    for (const db of dbs) {
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const body = { page_size: 100, filter: { and: [{ property: db.dateProperty, date: { on_or_after: from } }, { property: db.dateProperty, date: { on_or_before: to } }] }, ...(cursor ? { start_cursor: cursor } : {}) };
        const r = await call(`${API}/databases/${encodeURIComponent(db.id)}/query`, { method: "POST", headers: headers(tokens), body: JSON.stringify(body) });
        out.push(...normalizeNotionPages((r?.results ?? []) as NotionPage[], db, tz));
        if (!r?.has_more) break;
        cursor = r.next_cursor;
      }
    }
    return out;
  },
};
