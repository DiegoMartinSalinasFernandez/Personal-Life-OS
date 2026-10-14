# Integrations Center — capability report, architecture & setup

Settings → **Integrations & connections** (`/settings/integrations`).

All integrations are **read-only**. No payments, transfers, trades, withdrawals or
calendar edits can be made through them. A provider shows **Connected** only after
the server completed the official OAuth flow *and* a verification API call succeeded.

---

## 1. Capability report

Findings come from each provider's official developer documentation, checked in
October 2026 before implementation. Live calls against real accounts were **not**
performed (no production credentials were available) — see §5.

### Mercado Pago — *partially supported*

| Question | Finding |
| --- | --- |
| Official API | Yes — Mercado Pago Developers (Payments, OAuth). |
| OAuth | Authorization-code flow (`https://auth.mercadopago.com/authorization`, token at `POST https://api.mercadopago.com/oauth/token`). PKCE (S256) supported once enabled in the application settings. Access token lasts 180 days; `refresh_token` grant renews it and **rotates** the refresh token (requires `offline_access`). |
| Intended use | Platforms/marketplaces acting on behalf of **sellers**. Requires creating an application in Mercado Pago Developers. |
| Personal account data | `GET /users/me` identifies the account. `GET /v1/payments/search` returns payments related to the authorized account — primarily money **collected** as a seller (amount, currency, dates, description, status, fee details). |
| Not available publicly | A personal wallet statement (QR/card purchases, P2P transfers, balance). No documented public balance endpoint for this use case. No documented token-revocation endpoint. |
| Automatic sync | Implemented for payments search. Rows where the user is neither clearly collector nor payer are marked *direction unknown* and wait for review. Non-final statuses wait for review; rejected/cancelled are ignored. |
| CSV | Account/settlement reports downloaded from Mercado Pago can be imported (preset detects `SOURCE_ID`, `NET_CREDIT_AMOUNT`, `NET_DEBIT_AMOUNT`; mapping is always editable). `SOURCE_ID` becomes the de-duplication id. |
| Further investigation | Mercado Pago's Reports API (release/settlement reports) could automate the CSV path for seller accounts; not implemented. |

Sources: [OAuth — get access token](https://www.mercadopago.com.ar/developers/en/docs/security/oauth/creation) ·
[Renew access token](https://www.mercadopago.com.ar/developers/en/docs/oauth/renewal) ·
[POST /oauth/token reference](https://www.mercadopago.com.ar/developers/en/reference/oauth/_oauth_token/post) ·
[Received payments management](https://www.mercadopago.com.ar/developers/en/docs/subscriptions/additional-content/payment-management)

### Cocos Capital — *no official API*

| Question | Finding |
| --- | --- |
| Official API / OAuth for personal accounts | None published. |
| Community libraries | Exist (e.g. pyCocos) but rely on undocumented private endpoints and the user's password/2FA — **not used** and never will be. |
| Implemented instead | CSV import of account activity (column mapping), holdings snapshots (CSV or manual) preserving asset, quantity, currency, price and valuation date. Imported vs manual data is labelled. No live prices are fetched or invented. |

Sources: [API Evangelist — Cocos (no public API)](https://providers.apievangelist.com/providers/cocos/) ·
[pyCocos — unofficial, reverse-engineered](https://github.com/nacho-herrera/pyCocos)

### Other financial provider — *configurable slot*
CSV/statement import with the same staging, duplicate detection and review. Add a
server adapter once a provider's official API is verified.

### Google Calendar — *supported (read-only)*

| Question | Finding |
| --- | --- |
| API / OAuth | Google Calendar API v3 with OAuth 2.0 for web server apps (authorization code + PKCE, `access_type=offline` for refresh tokens). |
| Scopes requested | `calendar.calendarlist.readonly` (list calendars) and `calendar.events.readonly` (read events). Both are required; partial grants are rejected. No write scope is requested. |
| Events | `events.list` with `singleEvents=true` so recurring series arrive as instances with stable ids (no duplicates). Times are converted to the profile timezone; all-day end dates are exclusive. |
| Revocation | `POST https://oauth2.googleapis.com/revoke` on disconnect. |
| Approval | Sensitive scopes: apps used beyond test users need Google's OAuth verification. |

Sources: [Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth) ·
[calendarList.get scopes](https://developers.google.com/calendar/v3/reference/calendarList/get) ·
[OAuth 2.0 for web server apps](https://developers.google.com/identity/protocols/oauth2/web-server)

### Notion / Notion Calendar — *compatible workflows*

| Question | Finding |
| --- | --- |
| Notion Calendar public API | None. The app does not claim to connect to Notion Calendar directly. |
| Workflow A | Connect the same Google Calendar here and in Notion Calendar; both show the same events. |
| Workflow B | Official Notion API public integration (OAuth, `POST /v1/oauth/token` with Basic auth; refresh tokens rotate). Reads entries with a date property from databases the user explicitly shares with the integration (`/v1/search`, `/v1/databases/{id}/query`, pinned `Notion-Version: 2022-06-28`). |
| Further investigation | Notion's newer API versions move databases to "data sources"; re-test the pinned version before production. No revocation endpoint — users remove the connection in Notion settings. |

Sources: [Notion authorization guide](https://developers.notion.com/docs/authorization) ·
[Refresh a token](https://developers.notion.com/reference/refresh-a-token)

---

## 2. Architecture

```
Browser (localStorage)                    Next.js server (Node runtime)                 Providers
─────────────────────                     ─────────────────────────────                 ─────────
Settings → Integrations ──GET /api/integrations/status──▶ status (no tokens)
  "Connect" (consent dialog) ─GET /:provider/connect──▶ state+PKCE cookie ─302──▶ official consent page
                                    ◀──302 /:provider/callback?code&state──────────────────┘
                                    validate state → exchange code → verify → encrypt & store
  Sync ──POST /:provider/sync (x-life-os + Origin)──▶ refresh if needed → read API → normalized rows
  staging (importedRecords) → review → accepted transactions (with source ids)
```

* **Server code**: `src/lib/server/*` (crypto, env, session, OAuth state, providers, stores, handlers),
  routes in `src/app/api/integrations/**`.
* **Shared logic** (tested): `src/lib/integrations/*` — catalog & statuses, importer
  (staging, fingerprints, duplicate detection, review rules), CSV presets, normalizers.
* **Client data** (local, per browser): `integrationSources`, `importRuns`, `importedRecords`,
  `holdings`, `externalEvents`, `calendarSources`; transactions carry `source { provider, externalId, runId }`.
* **Server data** (credential store): connection metadata, encrypted tokens, sync-run audit log.

### Financial data rules
* Imports land in a **staging area**. Only clean rows (known direction, amount, description, final
  status, matching currency, linked account, not transfer/investment-like, no probable duplicate)
  are auto-accepted — and not even those if the source is set to *review every row*.
* Duplicate prevention: exact provider id / file fingerprint (skipped), plus probable-duplicate
  matching against manual transactions (same account & amount, ±2 days) → *link* instead of import.
* Transfers between own accounts are recorded as transfers (not income/expense); investment-like
  rows are flagged; fees become a separate expense so the account nets correctly.
* Disconnecting never deletes imported transactions or import history.
* Investment holdings are shown separately from cash balances, with their valuation date.

### Security controls
| Control | Implementation |
| --- | --- |
| Secrets server-only | Read from env in `src/lib/server/env.ts`; responses expose only "configured / missing names". |
| Token encryption | AES-256-GCM, random IV, associated data = `owner:provider` (a token can't be moved to another owner). |
| CSRF on OAuth | 256-bit `state` in an encrypted, HttpOnly, SameSite=Lax, 10-minute, single-use cookie bound to session + provider; constant-time comparison. |
| PKCE | S256 for Google and Mercado Pago. |
| Redirect URI | Built from `APP_BASE_URL` (validated: https or localhost), never from request headers; post-login redirect fixed to `/settings/integrations`. |
| CSRF on API | POST routes require `x-life-os: 1` + same-origin `Origin`. |
| Least privilege | Read-only scopes; no write endpoints implemented. |
| Revocation | Google token revoked on disconnect; tokens always deleted server-side. |
| Isolation | All store methods are owner-scoped; signed session cookie (HMAC); Supabase RLS policies. |
| Audit log | `integration_sync_runs` / file store runs + structured logs with secret keys redacted. |
| No passwords | The UI never asks for provider passwords, 2FA codes or API secrets. |

---

## 3. Developer setup (what you need to do)

1. **Run with the Node server.** Integrations need `npm run build && npm start` (or `npm run dev`).
   Purely static hosting can't run the OAuth callbacks — the page then reports
   "requires developer configuration" and CSV/manual workflows keep working.
2. **Core secrets** — copy `.env.example` to `.env.local` and set:
   * `APP_BASE_URL` — e.g. `http://localhost:3000` locally, your https origin in production.
   * `SESSION_SECRET` — `openssl rand -base64 48`
   * `INTEGRATIONS_ENCRYPTION_KEY` — `openssl rand -base64 32` (keep it stable; rotating it invalidates stored tokens).
3. **Credential store**
   * Single server/VPS: default `INTEGRATIONS_STORE=file` (encrypted JSON at `.data/integrations.json`, git-ignored, mode 0600).
   * Serverless (e.g. Vercel): use Supabase — create a project, run `supabase/migrations/0001_integrations.sql`
     in the SQL editor, set `INTEGRATIONS_STORE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
     (server env only; never `NEXT_PUBLIC_`).
4. **Google Calendar**
   * Google Cloud Console → create/select a project → *APIs & Services → Library* → enable **Google Calendar API**.
   * *OAuth consent screen*: External, add scopes `.../auth/calendar.calendarlist.readonly` and
     `.../auth/calendar.events.readonly`, add yourself as a test user (publishing beyond test users requires Google verification for sensitive scopes).
   * *Credentials → Create OAuth client ID → Web application*; authorized redirect URI:
     `{APP_BASE_URL}/api/integrations/google/callback`.
   * Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. **Mercado Pago**
   * [Mercado Pago Developers](https://www.mercadopago.com.ar/developers) → *Your integrations* → create an application.
   * Configure the redirect URL `{APP_BASE_URL}/api/integrations/mercadopago/callback`, enable
     **Authorization code with PKCE**, and make sure `offline_access` is available for refresh tokens.
   * Set `MERCADOPAGO_CLIENT_ID` (App ID) and `MERCADOPAGO_CLIENT_SECRET`; set `MERCADOPAGO_AUTH_HOST`
     to your country's auth host if the global one doesn't work for your account.
   * Expect the API to return seller-side payments; personal spending still comes from CSV reports.
6. **Notion (optional, Workflow B)**
   * notion.so/profile/integrations → *New integration* → **Public**; capabilities: *Read content* only.
   * Redirect URI `{APP_BASE_URL}/api/integrations/notion/callback`; set `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`.
   * When connecting, share the database(s) with dates with the integration.
7. Restart the server, open **Settings → Integrations**, connect, then press **Sync**.

---

## 4. Tests

`npm test` — `tests/integrations-server.test.ts` and `tests/integrations-client.test.ts` cover
encryption & tamper detection, config validation, OAuth state (forged/expired/replayed/wrong
provider or session), Google & Mercado Pago connect → callback → verify → encrypted storage
(with provider HTTP mocked), denied consent and partial scopes, verification failure,
CSRF checks, cross-session isolation, token refresh + expiry handling, disconnect/revocation,
the 3-provider limit (server and client), Supabase owner scoping, timezone/DST/all-day/recurring
normalization, staging, auto-accept rules, idempotent re-imports, duplicate linking, transfers,
CSV presets and preservation of history after disconnecting.

## 5. Not verified

* No live OAuth round-trip with real Google, Mercado Pago or Notion accounts was performed —
  these require your developer credentials and authorized accounts.
* Mercado Pago's exact report CSV columns vary by report type; the preset only *suggests* mappings.
* Cocos export formats are unverified; column mapping is required.
