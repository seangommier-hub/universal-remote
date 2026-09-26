import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const OWNER_ONLY_FILE_MODE = 0o600;

/** String key/value store kept in memory and, when given a path, mirrored to an owner-only JSON file. */
export class KeyValueStore {
  private readonly values = new Map<string, string>();

  constructor(private readonly filePath?: string) {
    if (filePath && existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string>;
      Object.entries(parsed).forEach(([key, value]) => this.values.set(key, value));
    }
  }

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
    this.persist();
  }

  remove(key: string): void {
    this.values.delete(key);
    this.persist();
  }

  private persist(): void {
    if (!this.filePath) return;
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(Object.fromEntries(this.values)), { mode: OWNER_ONLY_FILE_MODE });
    chmodSync(temporaryPath, OWNER_ONLY_FILE_MODE);
    renameSync(temporaryPath, this.filePath);
  }
}
