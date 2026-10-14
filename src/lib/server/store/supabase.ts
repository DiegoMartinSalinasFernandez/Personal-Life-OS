/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are untyped JSON */
import type { ConnectionRecord, CredentialStore, SyncRunRecord } from "./types";

type Fetch = typeof fetch;

/**
 * Supabase (PostgREST) store. Uses the service-role key, which exists only in
 * server env vars. Tables & RLS: supabase/migrations/0001_integrations.sql.
 * Ciphertext lives in integration_tokens, separate from account metadata.
 */
export class SupabaseStore implements CredentialStore {
  readonly kind = "supabase" as const;
  constructor(private url: string, private serviceKey: string, private f: Fetch = fetch) {}

  private async req(path: string, init: RequestInit & { prefer?: string } = {}) {
    const res = await this.f(`${this.url.replace(/\/$/, "")}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: this.serviceKey, authorization: `Bearer ${this.serviceKey}`, "content-type": "application/json", ...(init.prefer ? { prefer: init.prefer } : {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.status === 204 ? null : res.json();
  }
  private q = (v: string) => encodeURIComponent(v);

  private fromRow(a: Record<string, any>, tokens: string): ConnectionRecord {
    return {
      ownerId: a.owner_id,
      provider: a.provider,
      status: a.status,
      accountLabel: a.account_label,
      externalAccountId: a.external_account_id,
      scopes: a.scopes ?? [],
      connectedAt: a.connected_at,
      lastVerifiedAt: a.last_verified_at,
      lastSyncAt: a.last_sync_at,
      lastError: a.last_error,
      tokens,
      tokenExpiresAt: a.token_expires_at,
    };
  }
  private toRow(r: Partial<ConnectionRecord>) {
    const row: Record<string, unknown> = {};
    const map: [keyof ConnectionRecord, string][] = [["ownerId", "owner_id"], ["provider", "provider"], ["status", "status"], ["accountLabel", "account_label"], ["externalAccountId", "external_account_id"], ["scopes", "scopes"], ["connectedAt", "connected_at"], ["lastVerifiedAt", "last_verified_at"], ["lastSyncAt", "last_sync_at"], ["lastError", "last_error"], ["tokenExpiresAt", "token_expires_at"]];
    for (const [k, col] of map) if (k in r) row[col] = r[k];
    return row;
  }

  async list(ownerId: string) {
    const rows = (await this.req(`integration_accounts?owner_id=eq.${this.q(ownerId)}&select=*,integration_tokens(ciphertext)`)) as Record<string, any>[];
    return rows.map((a) => this.fromRow(a, a.integration_tokens?.ciphertext ?? ""));
  }
  async get(ownerId: string, provider: string) {
    return (await this.list(ownerId)).find((c) => c.provider === provider) ?? null;
  }
  async put(rec: ConnectionRecord) {
    const [acc] = (await this.req("integration_accounts?on_conflict=owner_id,provider", { method: "POST", body: JSON.stringify(this.toRow(rec)), prefer: "resolution=merge-duplicates,return=representation" })) as { id: string }[];
    await this.req("integration_tokens?on_conflict=account_id", { method: "POST", body: JSON.stringify({ account_id: acc.id, owner_id: rec.ownerId, ciphertext: rec.tokens }), prefer: "resolution=merge-duplicates" });
  }
  async patch(ownerId: string, provider: string, patch: Partial<ConnectionRecord>) {
    const { tokens, ...rest } = patch;
    const rows = (await this.req(`integration_accounts?owner_id=eq.${this.q(ownerId)}&provider=eq.${this.q(provider)}`, { method: "PATCH", body: JSON.stringify(this.toRow(rest)), prefer: "return=representation" })) as { id: string }[];
    if (tokens !== undefined && rows[0]) await this.req(`integration_tokens?account_id=eq.${rows[0].id}`, { method: "PATCH", body: JSON.stringify({ ciphertext: tokens }) });
  }
  async remove(ownerId: string, provider: string) {
    // integration_tokens rows cascade on delete.
    await this.req(`integration_accounts?owner_id=eq.${this.q(ownerId)}&provider=eq.${this.q(provider)}`, { method: "DELETE" });
  }
  async logRun(run: SyncRunRecord) {
    await this.req("integration_sync_runs", { method: "POST", body: JSON.stringify({ id: run.id, owner_id: run.ownerId, provider: run.provider, action: run.action, started_at: run.startedAt, finished_at: run.finishedAt, ok: run.ok, item_count: run.itemCount, error_code: run.errorCode }) });
  }
  async runs(ownerId: string, provider: string, limit = 20) {
    const rows = (await this.req(`integration_sync_runs?owner_id=eq.${this.q(ownerId)}&provider=eq.${this.q(provider)}&order=started_at.desc&limit=${limit}`)) as Record<string, any>[];
    return rows.map((r) => ({ id: r.id, ownerId: r.owner_id, provider: r.provider, action: r.action, startedAt: r.started_at, finishedAt: r.finished_at, ok: r.ok, itemCount: r.item_count, errorCode: r.error_code }));
  }
}
