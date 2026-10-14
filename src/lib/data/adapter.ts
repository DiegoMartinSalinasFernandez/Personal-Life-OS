import type { Database } from "../domain/types";
import { normalizeDatabase } from "./defaults";

/**
 * Persistence boundary. The UI and store only talk to this interface, so a
 * hosted backend (e.g. Supabase/Postgres with row-level security) can replace
 * local storage without touching screens or business logic.
 */
export interface DataAdapter {
  readonly kind: "local" | "remote";
  readonly label: string;
  load(): Database | null;
  save(db: Database): void;
  clear(): void;
  /** Notifies when another tab/device changed the data. Returns an unsubscribe fn. */
  subscribe?(onChange: (db: Database) => void): () => void;
}

const KEY = "life-os:db:v1";

/** Browser-only persistence. Data never leaves this device. */
export class LocalStorageAdapter implements DataAdapter {
  readonly kind = "local" as const;
  readonly label = "This browser (local storage)";

  load(): Database | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? normalizeDatabase(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  save(db: Database): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(db));
    } catch (err) {
      console.error("Could not save data to local storage", err);
      throw err;
    }
  }

  clear(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(KEY);
  }

  subscribe(onChange: (db: Database) => void): () => void {
    const handler = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        onChange(normalizeDatabase(JSON.parse(e.newValue)));
      } catch {}
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }
}

export function createAdapter(): DataAdapter {
  // Only local mode exists today. NEXT_PUBLIC_DATA_BACKEND is reserved for a future remote adapter.
  return new LocalStorageAdapter();
}
