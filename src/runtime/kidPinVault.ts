import { isValidPin } from "../core/kidMode/pinPolicy";
import { afterWrongPin, freshLockout, LockoutState, lockoutRemainingMs, normalizeLockout } from "../core/kidMode/pinLockout";

// ADR-HEARTH-176: the adult PIN. Only a salted hash is stored (salt is per phone, generated when the PIN is set);
// the PIN itself is never written anywhere. The lockout state is stored too so restarting the app does not reset it.

export const PIN_RECORD_KEY = "hearth.kidMode.pin.v1";
export const LOCKOUT_KEY = "hearth.kidMode.lockout.v1";

/** Where the vault keeps its two small records; production uses expo-secure-store. */
export interface VaultStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface KidPinVaultDeps {
  storage: VaultStorage;
  /** Lowercase hex SHA-256 of the text. */
  digest(text: string): Promise<string>;
  newSalt(): string;
  now(): number;
  /** The household's Family Command Center token, or null when this phone is not connected. */
  getHouseholdToken(): Promise<string | null>;
}

export type PinCheckResult = { ok: true } | { ok: false; reason: "wrong" | "locked" | "not-set"; lockedForMs?: number };

interface PinRecord {
  salt: string;
  hash: string;
}

function isPinRecord(value: unknown): value is PinRecord {
  const record = value as Partial<PinRecord> | null;
  return !!record && typeof record.salt === "string" && typeof record.hash === "string";
}

/** Stores and checks the adult PIN with a wrong-try lockout. */
export class KidPinVault {
  constructor(private deps: KidPinVaultDeps) {}

  /** Whether an adult PIN has been set on this phone. */
  async isPinSet(): Promise<boolean> {
    return (await this.readRecord()) !== null;
  }

  /** Sets (or replaces) the PIN; throws when it is not four digits. */
  async setPin(pin: string): Promise<void> {
    if (!isValidPin(pin)) throw new Error("PIN must be four digits");
    const salt = this.deps.newSalt();
    const record: PinRecord = { salt, hash: await this.deps.digest(`${salt}:${pin}`) };
    await this.deps.storage.set(PIN_RECORD_KEY, JSON.stringify(record));
    await this.writeLockout(freshLockout());
  }

  /** Checks an entered PIN, counting wrong tries and refusing everything during a lockout. */
  async verify(pin: string): Promise<PinCheckResult> {
    const record = await this.readRecord();
    if (!record) return { ok: false, reason: "not-set" };
    const lockout = await this.readLockout();
    const remaining = lockoutRemainingMs(lockout, this.deps.now());
    if (remaining > 0) return { ok: false, reason: "locked", lockedForMs: remaining };
    if ((await this.deps.digest(`${record.salt}:${pin}`)) === record.hash) {
      await this.writeLockout(freshLockout());
      return { ok: true };
    }
    const next = afterWrongPin(lockout, this.deps.now());
    await this.writeLockout(next);
    const lockedForMs = lockoutRemainingMs(next, this.deps.now());
    return lockedForMs > 0 ? { ok: false, reason: "locked", lockedForMs } : { ok: false, reason: "wrong" };
  }

  /** Milliseconds a lockout still has to run, 0 when entry is allowed. */
  async lockedForMs(): Promise<number> {
    return lockoutRemainingMs(await this.readLockout(), this.deps.now());
  }

  /** "Forgot PIN": clears the PIN when the typed household token matches this phone's saved one. Returns whether it did. */
  async resetWithHouseholdToken(typedToken: string): Promise<boolean> {
    const saved = await this.deps.getHouseholdToken();
    if (!saved || typedToken.trim() !== saved) return false;
    await this.deps.storage.remove(PIN_RECORD_KEY);
    await this.deps.storage.remove(LOCKOUT_KEY);
    return true;
  }

  private async readRecord(): Promise<PinRecord | null> {
    const raw = await this.deps.storage.get(PIN_RECORD_KEY);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isPinRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async readLockout(): Promise<LockoutState> {
    const raw = await this.deps.storage.get(LOCKOUT_KEY);
    try {
      return raw ? normalizeLockout(JSON.parse(raw)) : freshLockout();
    } catch {
      return freshLockout();
    }
  }

  private async writeLockout(state: LockoutState): Promise<void> {
    await this.deps.storage.set(LOCKOUT_KEY, JSON.stringify(state));
  }
}
