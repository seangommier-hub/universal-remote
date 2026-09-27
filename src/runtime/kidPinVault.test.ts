import { KidPinVault, LOCKOUT_KEY, PIN_RECORD_KEY, VaultStorage } from "./kidPinVault";
import { LOCKOUT_MS, MAX_WRONG_TRIES } from "../core/kidMode/pinLockout";

function build(token: string | null = "household-token") {
  const data = new Map<string, string>();
  const storage: VaultStorage = {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
  let clock = 1_000_000;
  let salts = 0;
  const vault = new KidPinVault({
    storage,
    digest: async (text) => `hash(${text})`,
    newSalt: () => `salt-${++salts}`,
    now: () => clock,
    getHouseholdToken: async () => token,
  });
  return { vault, data, advance: (ms: number) => (clock += ms) };
}

describe("KidPinVault", () => {
  test("stores a salted hash, and the salt differs per set so the same PIN never stores the same hash twice", async () => {
    const { vault, data } = build();
    await vault.setPin("4827");
    const first = JSON.parse(data.get(PIN_RECORD_KEY) ?? "{}");
    expect(first).toEqual({ salt: "salt-1", hash: "hash(salt-1:4827)" });
    await vault.setPin("4827");
    expect(JSON.parse(data.get(PIN_RECORD_KEY) ?? "{}").hash).not.toBe(first.hash);
  });

  test("the plain PIN is never written to storage", async () => {
    const { vault, data } = build();
    await vault.setPin("4827");
    const stored = [...data.values()].join("|");
    expect(stored).not.toMatch(/(^|[^:])4827/);
  });

  test("the right PIN passes and the wrong one is refused", async () => {
    const { vault } = build();
    await vault.setPin("4827");
    expect(await vault.verify("4827")).toEqual({ ok: true });
    expect(await vault.verify("0000")).toEqual({ ok: false, reason: "wrong" });
  });

  test("a PIN that is not four digits cannot be set", async () => {
    const { vault } = build();
    await expect(vault.setPin("12")).rejects.toThrow();
    expect(await vault.isPinSet()).toBe(false);
    expect(await vault.verify("1234")).toEqual({ ok: false, reason: "not-set" });
  });

  test("five wrong tries lock for 30 seconds, even the right PIN is refused, then it works again", async () => {
    const { vault, advance } = build();
    await vault.setPin("4827");
    for (let i = 1; i < MAX_WRONG_TRIES; i++) expect(await vault.verify("0000")).toEqual({ ok: false, reason: "wrong" });
    expect(await vault.verify("0000")).toEqual({ ok: false, reason: "locked", lockedForMs: LOCKOUT_MS });
    expect(await vault.verify("4827")).toMatchObject({ ok: false, reason: "locked" });
    advance(LOCKOUT_MS - 1);
    expect(await vault.verify("4827")).toMatchObject({ ok: false, reason: "locked" });
    advance(1);
    expect(await vault.verify("4827")).toEqual({ ok: true });
  });

  test("a correct PIN resets the count of misses", async () => {
    const { vault } = build();
    await vault.setPin("4827");
    for (let i = 0; i < MAX_WRONG_TRIES - 1; i++) await vault.verify("0000");
    await vault.verify("4827");
    for (let i = 0; i < MAX_WRONG_TRIES - 1; i++) expect(await vault.verify("0000")).toEqual({ ok: false, reason: "wrong" });
  });

  test("the lockout is stored, so restarting the app does not clear it", async () => {
    const { vault, data } = build();
    await vault.setPin("4827");
    for (let i = 0; i < MAX_WRONG_TRIES; i++) await vault.verify("0000");
    expect(JSON.parse(data.get(LOCKOUT_KEY) ?? "{}").lockedUntil).toBeGreaterThan(0);
    expect(await vault.lockedForMs()).toBe(LOCKOUT_MS);
  });

  test("Forgot PIN clears the PIN only with this phone's household token", async () => {
    const { vault } = build("household-token");
    await vault.setPin("4827");
    expect(await vault.resetWithHouseholdToken("wrong")).toBe(false);
    expect(await vault.isPinSet()).toBe(true);
    expect(await vault.resetWithHouseholdToken("  household-token ")).toBe(true);
    expect(await vault.isPinSet()).toBe(false);
  });

  test("Forgot PIN is refused when the phone has no household token", async () => {
    const { vault } = build(null);
    await vault.setPin("4827");
    expect(await vault.resetWithHouseholdToken("")).toBe(false);
    expect(await vault.isPinSet()).toBe(true);
  });

  test("a damaged stored record reads as no PIN", async () => {
    const { vault, data } = build();
    data.set(PIN_RECORD_KEY, "{not json");
    expect(await vault.isPinSet()).toBe(false);
  });
});
