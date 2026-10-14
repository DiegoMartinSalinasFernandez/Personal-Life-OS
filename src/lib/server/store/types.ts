import type { ServerConnection } from "../../integrations/catalog";

/** One OAuth connection per owner+provider. `tokens` is ciphertext only. */
export interface ConnectionRecord extends ServerConnection {
  ownerId: string;
  tokens: string;
  tokenExpiresAt: string | null;
}

export interface SyncRunRecord {
  id: string;
  ownerId: string;
  provider: string;
  action: "connect" | "verify" | "sync" | "refresh" | "disconnect";
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  itemCount: number;
  errorCode: string | null;
}

/**
 * Every method is scoped by ownerId — there is no way to list or read another
 * owner's records through this interface.
 */
export interface CredentialStore {
  readonly kind: "file" | "supabase" | "memory";
  list(ownerId: string): Promise<ConnectionRecord[]>;
  get(ownerId: string, provider: string): Promise<ConnectionRecord | null>;
  put(rec: ConnectionRecord): Promise<void>;
  patch(ownerId: string, provider: string, patch: Partial<Omit<ConnectionRecord, "ownerId" | "provider">>): Promise<void>;
  remove(ownerId: string, provider: string): Promise<void>;
  logRun(run: SyncRunRecord): Promise<void>;
  runs(ownerId: string, provider: string, limit?: number): Promise<SyncRunRecord[]>;
}

export const toPublic = (r: ConnectionRecord): ServerConnection => ({
  provider: r.provider,
  status: r.status,
  accountLabel: r.accountLabel,
  externalAccountId: r.externalAccountId,
  scopes: r.scopes,
  connectedAt: r.connectedAt,
  lastVerifiedAt: r.lastVerifiedAt,
  lastSyncAt: r.lastSyncAt,
  lastError: r.lastError,
});
