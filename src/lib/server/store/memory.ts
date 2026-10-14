import type { ConnectionRecord, CredentialStore, SyncRunRecord } from "./types";

export interface StoreData {
  connections: ConnectionRecord[];
  runs: SyncRunRecord[];
}

/** In-memory store (tests) and the base for the file store. */
export class MemoryStore implements CredentialStore {
  readonly kind: "memory" | "file" = "memory";
  protected data: StoreData = { connections: [], runs: [] };
  protected async load(): Promise<StoreData> {
    return this.data;
  }
  protected async save(data: StoreData): Promise<void> {
    this.data = data;
  }
  private chain: Promise<unknown> = Promise.resolve();
  /** Serializes read-modify-write cycles. */
  protected mutate(fn: (d: StoreData) => StoreData): Promise<void> {
    const next = this.chain.then(async () => this.save(fn(structuredClone(await this.load()))));
    this.chain = next.catch(() => undefined);
    return next;
  }

  async list(ownerId: string) {
    return (await this.load()).connections.filter((c) => c.ownerId === ownerId);
  }
  async get(ownerId: string, provider: string) {
    return (await this.load()).connections.find((c) => c.ownerId === ownerId && c.provider === provider) ?? null;
  }
  put(rec: ConnectionRecord) {
    return this.mutate((d) => ({ ...d, connections: [...d.connections.filter((c) => !(c.ownerId === rec.ownerId && c.provider === rec.provider)), rec] }));
  }
  patch(ownerId: string, provider: string, patch: Partial<ConnectionRecord>) {
    return this.mutate((d) => ({ ...d, connections: d.connections.map((c) => (c.ownerId === ownerId && c.provider === provider ? { ...c, ...patch, ownerId, provider } : c)) }));
  }
  remove(ownerId: string, provider: string) {
    return this.mutate((d) => ({ ...d, connections: d.connections.filter((c) => !(c.ownerId === ownerId && c.provider === provider)) }));
  }
  logRun(run: SyncRunRecord) {
    return this.mutate((d) => ({ ...d, runs: [...d.runs.slice(-999), run] }));
  }
  async runs(ownerId: string, provider: string, limit = 20) {
    return (await this.load()).runs.filter((r) => r.ownerId === ownerId && r.provider === provider).slice(-limit).reverse();
  }
}
