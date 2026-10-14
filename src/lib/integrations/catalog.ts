/**
 * Provider catalog + capability findings.
 *
 * Everything here is client-safe metadata. Findings come from each provider's
 * official documentation (see docs/INTEGRATIONS.md for the full report and the
 * date it was checked). Nothing in this file grants or implies a connection —
 * live status always comes from the server (`/api/integrations/status`).
 */

export type ProviderGroup = "finance" | "calendar";
export type IntegrationMode =
  /** Official OAuth implemented; becomes "Connected" only after server-side verification. */
  | "oauth"
  /** File import is the supported path. */
  | "csv"
  /** Works through another supported integration (no direct API). */
  | "compatible"
  | "unsupported";

export type CapabilityLevel = "supported" | "partial" | "csv" | "unsupported" | "unverified";

export interface Capability {
  label: string;
  level: CapabilityLevel;
  note?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  group: ProviderGroup;
  /** Short neutral monogram used as the logo (no third-party trademarks are bundled). */
  monogram: string;
  brandColor: string;
  tagline: string;
  description: string;
  modes: IntegrationMode[];
  capabilities: Capability[];
  /** Server env vars needed for the OAuth flow (names only). */
  envKeys: string[];
  docs: { label: string; url: string }[];
  /** Scopes/permissions requested by the implemented flow. */
  permissions: string[];
  /** Shown before the user is sent to the provider. */
  dataAccessed: string[];
  readOnly: true;
}

export const MAX_FINANCE_CONNECTIONS = 3;

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "mercadopago",
    name: "Mercado Pago",
    group: "finance",
    monogram: "MP",
    brandColor: "#00A1E4",
    tagline: "Payments received (seller API) + account report import",
    description:
      "Mercado Pago's OAuth is built for platforms acting on behalf of sellers. With the account owner's authorization the Payments API returns payments related to that account — mainly money collected as a seller. It does not expose a personal wallet statement (purchases, P2P transfers, card spending, balance) through a public endpoint. Personal activity can be brought in from Mercado Pago's downloadable account reports (CSV).",
    modes: ["oauth", "csv"],
    capabilities: [
      { label: "Account identification", level: "supported", note: "GET /users/me" },
      { label: "Payments received as collector/seller", level: "supported", note: "GET /v1/payments/search — amounts, currency, dates, description, status, fees" },
      { label: "Payments made as a buyer", level: "partial", note: "Only when they appear in the search results for the authorized account; not guaranteed for wallet purchases" },
      { label: "Personal wallet statement (P2P, card, QR spending)", level: "csv", note: "No public endpoint; import the account activity/settlement report CSV" },
      { label: "Account balance", level: "unsupported", note: "No documented public balance endpoint for this use case" },
      { label: "Payments, transfers or withdrawals", level: "unsupported", note: "Intentionally not implemented — integration is read-only" },
    ],
    envKeys: ["MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_CLIENT_SECRET"],
    docs: [
      { label: "OAuth — get access token", url: "https://www.mercadopago.com.ar/developers/en/docs/security/oauth/creation" },
      { label: "OAuth — renew token", url: "https://www.mercadopago.com.ar/developers/en/docs/security/oauth/renewal" },
      { label: "Payments search API", url: "https://www.mercadopago.com.ar/developers/en/reference/payments/_payments_search/get" },
    ],
    permissions: ["read (payments of the authorized account)", "offline_access (refresh token)"],
    dataAccessed: ["Your Mercado Pago user id and nickname", "Payments related to your account: id, date, amount, currency, description, status, fees"],
    readOnly: true,
  },
  {
    id: "cocos",
    name: "Cocos Capital",
    group: "finance",
    monogram: "CC",
    brandColor: "#5B3DF5",
    tagline: "No official API — CSV import and manual balances",
    description:
      "Cocos Capital does not publish an official API or OAuth flow for retail investors. Community libraries rely on undocumented private endpoints and your login credentials, which this app will never use. Import activity or holdings from files you export, or keep balances and positions up to date manually.",
    modes: ["csv"],
    capabilities: [
      { label: "Official API / OAuth", level: "unsupported", note: "None published for personal accounts" },
      { label: "Account activity", level: "csv", note: "Import a CSV export (map columns on import)" },
      { label: "Holdings (asset, quantity, currency, valuation date)", level: "csv", note: "CSV or manual entry; prices are never fetched or invented" },
      { label: "Live market prices", level: "unsupported" },
      { label: "Trading or withdrawals", level: "unsupported", note: "Read-only by design" },
    ],
    envKeys: [],
    docs: [{ label: "Cocos Capital help center", url: "https://cocos.capital" }],
    permissions: [],
    dataAccessed: ["Only the files you choose to import"],
    readOnly: true,
  },
  {
    id: "custom",
    name: "Other financial provider",
    group: "finance",
    monogram: "+",
    brandColor: "#6B6B76",
    tagline: "Configurable slot — bank or broker statement via CSV",
    description:
      "A configurable provider for any bank, wallet or broker that lets you export statements. Imports go through the same review, duplicate detection and source labelling as the other providers.",
    modes: ["csv"],
    capabilities: [
      { label: "Statement import", level: "csv", note: "Column mapping, date formats, debit/credit columns" },
      { label: "Automatic sync", level: "unverified", note: "Add a provider adapter once an official API is confirmed" },
    ],
    envKeys: [],
    docs: [],
    permissions: [],
    dataAccessed: ["Only the files you choose to import"],
    readOnly: true,
  },
  {
    id: "google",
    name: "Google Calendar",
    group: "calendar",
    monogram: "G",
    brandColor: "#1A73E8",
    tagline: "Read-only sync of the calendars you choose",
    description:
      "Uses the official Google Calendar API with OAuth 2.0 (authorization code + PKCE). Only read-only scopes are requested: the list of your calendars and their events. Events show in the Activities calendar, clearly marked as Google events. Creating or editing Google events is not enabled.",
    modes: ["oauth"],
    capabilities: [
      { label: "List calendars", level: "supported", note: "calendar.calendarlist.readonly" },
      { label: "Read events incl. recurring instances", level: "supported", note: "calendar.events.readonly, singleEvents expansion" },
      { label: "Time zones", level: "supported", note: "Converted to your profile timezone" },
      { label: "Create / update events", level: "unsupported", note: "Not requested — would need write scopes" },
    ],
    envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    docs: [
      { label: "Calendar API scopes", url: "https://developers.google.com/workspace/calendar/api/auth" },
      { label: "OAuth 2.0 for web server apps", url: "https://developers.google.com/identity/protocols/oauth2/web-server" },
      { label: "Events: list", url: "https://developers.google.com/workspace/calendar/api/v3/reference/events/list" },
    ],
    permissions: ["calendar.calendarlist.readonly", "calendar.events.readonly"],
    dataAccessed: ["The list of calendars you're subscribed to", "Events in the calendars you select (title, time, location, link)"],
    readOnly: true,
  },
  {
    id: "notion",
    name: "Notion",
    group: "calendar",
    monogram: "N",
    brandColor: "#191919",
    tagline: "Notion Calendar has no public API — use a compatible workflow",
    description:
      "Notion Calendar does not offer a public API for third-party apps. Two supported workflows instead: (1) connect the same Google Calendar here and in Notion Calendar — both apps then show the same events; (2) connect a Notion workspace through the official Notion API and show entries from a database with a date property (the same databases Notion Calendar can display).",
    modes: ["compatible", "oauth"],
    capabilities: [
      { label: "Direct Notion Calendar sync", level: "unsupported", note: "No public Notion Calendar API" },
      { label: "Shared Google Calendar", level: "supported", note: "Via the Google Calendar integration" },
      { label: "Read Notion database items with dates", level: "supported", note: "Official Notion API, only pages you share with the integration" },
      { label: "Write to Notion", level: "unsupported", note: "Not enabled" },
    ],
    envKeys: ["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"],
    docs: [
      { label: "Notion API authorization", url: "https://developers.notion.com/docs/authorization" },
      { label: "Query a database", url: "https://developers.notion.com/reference/post-database-query" },
      { label: "Notion Calendar help", url: "https://www.notion.com/help/category/notion-calendar" },
    ],
    permissions: ["Read content of pages/databases you explicitly share with the integration"],
    dataAccessed: ["Workspace name", "Titles and date properties of database entries you share"],
    readOnly: true,
  },
];

export const OAUTH_PROVIDERS = ["google", "mercadopago", "notion"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];
export const isOAuthProvider = (id: string): id is OAuthProviderId => (OAUTH_PROVIDERS as readonly string[]).includes(id);
export const providerInfo = (id: string) => PROVIDERS.find((p) => p.id === id);

// ───────────────────────── Status model ─────────────────────────

export type IntegrationStatus =
  | "available"
  | "connected"
  | "sync_required"
  | "expired"
  | "error"
  | "manual_import"
  | "unsupported"
  | "needs_config";

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  available: "Available to connect",
  connected: "Connected",
  sync_required: "Synchronization required",
  expired: "Connection expired",
  error: "Error",
  manual_import: "Manual import available",
  unsupported: "Not currently supported",
  needs_config: "Requires developer configuration",
};

/** What the server reports about one OAuth provider (never includes tokens). */
export interface ServerConnection {
  provider: string;
  status: "connected" | "expired" | "error";
  accountLabel: string | null;
  externalAccountId: string | null;
  scopes: string[];
  connectedAt: string;
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
}

export interface ServerProviderState {
  provider: string;
  configured: boolean;
  missing: string[];
  connection: ServerConnection | null;
}

export interface StatusInput {
  info: ProviderInfo;
  server?: ServerProviderState | null;
  /** True when the server itself is unreachable/misconfigured (e.g. static hosting). */
  serverUnavailable?: boolean;
  /** Local CSV source active for this provider. */
  localCsvActive?: boolean;
  now?: number;
}

const SYNC_STALE_MS = 24 * 3600 * 1000;

/**
 * Truthful status: "connected" requires a server-verified connection.
 * Local CSV activity is reported as "manual import", never as connected.
 */
export function computeStatus({ info, server, serverUnavailable, localCsvActive, now = Date.now() }: StatusInput): IntegrationStatus {
  const hasOAuth = info.modes.includes("oauth");
  const conn = server?.connection;
  if (hasOAuth && conn) {
    if (conn.status === "expired") return "expired";
    if (conn.status === "error") return "error";
    if (conn.lastError && (!conn.lastSyncAt || conn.lastError.at > conn.lastSyncAt)) return "error";
    if (!conn.lastSyncAt || now - Date.parse(conn.lastSyncAt) > SYNC_STALE_MS) return "sync_required";
    return "connected";
  }
  if (info.modes.includes("csv")) return localCsvActive || !hasOAuth || serverUnavailable || !server?.configured ? "manual_import" : "available";
  if (!hasOAuth) return info.modes.includes("compatible") ? "manual_import" : "unsupported";
  if (serverUnavailable || !server?.configured) return "needs_config";
  return "available";
}

/** Number of financial providers currently counted toward the limit. */
export function activeFinanceCount(input: { localActiveProviders: string[]; serverConnected: string[] }): number {
  return new Set([...input.localActiveProviders.map((p, i) => (p === "custom" ? `custom#${i}` : p)), ...input.serverConnected]).size;
}

export function canAddFinanceConnection(activeCount: number): { ok: boolean; reason?: string } {
  if (activeCount >= MAX_FINANCE_CONNECTIONS)
    return { ok: false, reason: `You already have ${MAX_FINANCE_CONNECTIONS} financial providers connected. Disconnect one first — previously imported transactions are kept.` };
  return { ok: true };
}
