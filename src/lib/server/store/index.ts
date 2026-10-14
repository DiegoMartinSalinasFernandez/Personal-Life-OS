import { resolve } from "node:path";
import type { CoreConfig } from "../env";
import { FileStore } from "./file";
import { SupabaseStore } from "./supabase";
import type { CredentialStore } from "./types";

let override: CredentialStore | null = null;
let fileStore: FileStore | null = null;

/** Test hook: inject a store (e.g. MemoryStore). */
export function setStoreForTests(store: CredentialStore | null) {
  override = store;
}

export function getStore(cfg: CoreConfig, env: NodeJS.ProcessEnv = process.env): CredentialStore {
  if (override) return override;
  if (cfg.store === "supabase") return new SupabaseStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  fileStore ??= new FileStore(resolve(env.INTEGRATIONS_FILE_PATH || ".data/integrations.json"));
  return fileStore;
}

export type { CredentialStore, ConnectionRecord, SyncRunRecord } from "./types";
export { toPublic } from "./types";
