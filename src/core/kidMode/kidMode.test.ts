import { Device } from "../types/Device";
import { DEFAULT_BEDTIME, describeClock, formatClock, isValidBedtime, isWithinBedtime, parseClock } from "./bedtimeWindow";
import { devicesVisibleInMode, toggleKidAllowed } from "./kidModeFilter";
import { normalizeKidModeSettings } from "./kidModeSettings";
import { kidModeStatus } from "./kidModeStatus";
import { afterWrongPin, freshLockout, LOCKOUT_MS, lockoutRemainingMs, MAX_WRONG_TRIES, normalizeLockout } from "./pinLockout";
import { isValidPin, sanitizePinInput } from "./pinPolicy";

const at = (hours: number, minutes = 0) => new Date(2026, 8, 26, hours, minutes);
const device = (id: string): Device => ({ id, name: id, category: "tv", manufacturer: "X", driverId: "d", capabilities: [] });

describe("PIN policy", () => {
  test("exactly four digits are valid", () => {
    expect(isValidPin("0427")).toBe(true);
    expect(["123", "12345", "12a4", "", " 123"].some(isValidPin)).toBe(false);
  });
  test("input keeps only the first four digits", () => {
    expect(sanitizePinInput("1a2-3 456")).toBe("1234");
  });
});

describe("PIN lockout", () => {
  test("the fifth wrong try in a row locks for 30 seconds and restarts the count", () => {
    let state = freshLockout();
    for (let i = 1; i < MAX_WRONG_TRIES; i++) {
      state = afterWrongPin(state, 1000);
      expect(lockoutRemainingMs(state, 1000)).toBe(0);
    }
    state = afterWrongPin(state, 1000);
    expect(lockoutRemainingMs(state, 1000)).toBe(LOCKOUT_MS);
    expect(lockoutRemainingMs(state, 1000 + LOCKOUT_MS)).toBe(0);
    expect(state.failures).toBe(0);
  });
  test("malformed saved state reads as fresh", () => {
    expect(normalizeLockout("x")).toEqual(freshLockout());
    expect(normalizeLockout({ failures: -3, lockedUntil: "soon" })).toEqual(freshLockout());
    expect(normalizeLockout({ failures: 2.9, lockedUntil: 500 })).toEqual({ failures: 2, lockedUntil: 500 });
  });
});

describe("bedtime window", () => {
  const evening = { startMinutes: 20 * 60, endMinutes: 22 * 60 };
  test("a same-day window includes its start and excludes its end", () => {
    expect(isWithinBedtime(evening, at(20, 0))).toBe(true);
    expect(isWithinBedtime(evening, at(21, 59))).toBe(true);
    expect(isWithinBedtime(evening, at(22, 0))).toBe(false);
    expect(isWithinBedtime(evening, at(19, 59))).toBe(false);
  });
  test("an overnight window covers late evening and early morning but not midday", () => {
    expect(isWithinBedtime(DEFAULT_BEDTIME, at(20, 30))).toBe(true);
    expect(isWithinBedtime(DEFAULT_BEDTIME, at(23, 59))).toBe(true);
    expect(isWithinBedtime(DEFAULT_BEDTIME, at(0, 0))).toBe(true);
    expect(isWithinBedtime(DEFAULT_BEDTIME, at(6, 59))).toBe(true);
    expect(isWithinBedtime(DEFAULT_BEDTIME, at(7, 0))).toBe(false);
    expect(isWithinBedtime(DEFAULT_BEDTIME, at(12, 0))).toBe(false);
    expect(isWithinBedtime(DEFAULT_BEDTIME, at(20, 29))).toBe(false);
  });
  test("equal or out-of-range ends are not valid windows", () => {
    expect(isValidBedtime({ startMinutes: 60, endMinutes: 60 })).toBe(false);
    expect(isValidBedtime({ startMinutes: -1, endMinutes: 60 })).toBe(false);
    expect(isValidBedtime({ startMinutes: 0, endMinutes: 1440 })).toBe(false);
    expect(isValidBedtime(DEFAULT_BEDTIME)).toBe(true);
  });
  test("clock text parses and formats", () => {
    expect(parseClock("20:30")).toBe(1230);
    expect(parseClock(" 7:05 ")).toBe(425);
    expect(["24:00", "7:60", "abc", "", "7"].map(parseClock)).toEqual([null, null, null, null, null]);
    expect(formatClock(425)).toBe("07:05");
    expect(describeClock(1230)).toBe("8:30 pm");
    expect(describeClock(0)).toBe("12:00 am");
    expect(describeClock(720)).toBe("12:00 pm");
  });
});

describe("kid mode status and settings", () => {
  test("off, restricted, and bedtime by the phone clock", () => {
    expect(kidModeStatus({ enabled: false, bedtime: DEFAULT_BEDTIME }, at(22))).toBe("off");
    expect(kidModeStatus({ enabled: true }, at(22))).toBe("restricted");
    expect(kidModeStatus({ enabled: true, bedtime: DEFAULT_BEDTIME }, at(22))).toBe("bedtime");
    expect(kidModeStatus({ enabled: true, bedtime: DEFAULT_BEDTIME }, at(12))).toBe("restricted");
  });
  test("damaged saved settings mean off; an invalid bedtime is dropped but kid mode stays on", () => {
    expect(normalizeKidModeSettings("x")).toEqual({ enabled: false });
    expect(normalizeKidModeSettings({ enabled: "yes" })).toEqual({ enabled: false });
    expect(normalizeKidModeSettings({ enabled: true, bedtime: { startMinutes: 5, endMinutes: 5 } })).toEqual({ enabled: true });
    expect(normalizeKidModeSettings({ enabled: true, bedtime: DEFAULT_BEDTIME })).toEqual({ enabled: true, bedtime: DEFAULT_BEDTIME });
  });
});

describe("kid mode device filter", () => {
  const all = ["a", "b", "c"].map(device);
  test("kid mode shows only allowed devices, keeping order; otherwise everything", () => {
    expect(devicesVisibleInMode(all, ["c", "a", "gone"], true).map((d) => d.id)).toEqual(["a", "c"]);
    expect(devicesVisibleInMode(all, [], true)).toEqual([]);
    expect(devicesVisibleInMode(all, ["a"], false)).toHaveLength(3);
  });
  test("toggling adds then removes", () => {
    expect(toggleKidAllowed(toggleKidAllowed([], "a"), "b")).toEqual(["a", "b"]);
    expect(toggleKidAllowed(["a", "b"], "a")).toEqual(["b"]);
  });
});
