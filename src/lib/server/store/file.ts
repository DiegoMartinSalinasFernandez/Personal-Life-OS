import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { MemoryStore, type StoreData } from "./memory";

/**
 * JSON-file store for local / single-server deployments. Token fields are
 * already AES-GCM ciphertext before they reach this layer. The file is
 * written atomically with 0600 permissions and is git-ignored.
 * Not suitable for serverless hosts with ephemeral disks — use Supabase there.
 */
export class FileStore extends MemoryStore {
  readonly kind = "file" as const;
  constructor(private path: string) {
    super();
  }
  protected async load(): Promise<StoreData> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8"));
      return { connections: parsed.connections ?? [], runs: parsed.runs ?? [] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { connections: [], runs: [] };
      throw e;
    }
  }
  protected async save(data: StoreData): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    await rename(tmp, this.path);
  }
}
