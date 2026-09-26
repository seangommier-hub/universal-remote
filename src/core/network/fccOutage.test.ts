import { FCC_OUTAGE_GRACE_MS, FCC_OUTAGE_STALE_MS, getFccOutageMs, recordFccReached, recordFccUnreachable, resetFccOutageForTests, subscribeFccOutage } from "./fccOutage";

const T0 = 1_000_000;

describe("fccOutage", () => {
  beforeEach(() => resetFccOutageForTests());

  test("healthy until something fails", () => {
    expect(getFccOutageMs(T0)).toBeNull();
  });

  test("a single failure or a short blip is not an outage", () => {
    recordFccUnreachable(T0);
    expect(getFccOutageMs(T0)).toBeNull();
    recordFccUnreachable(T0 + FCC_OUTAGE_GRACE_MS - 1);
    expect(getFccOutageMs(T0 + FCC_OUTAGE_GRACE_MS - 1)).toBeNull();
  });

  test("failures spanning the grace period become an outage measured from the first failure", () => {
    recordFccUnreachable(T0);
    recordFccUnreachable(T0 + FCC_OUTAGE_GRACE_MS);
    expect(getFccOutageMs(T0 + FCC_OUTAGE_GRACE_MS + 5000)).toBe(FCC_OUTAGE_GRACE_MS + 5000);
  });

  test("a success ends the outage and restarts the streak", () => {
    recordFccUnreachable(T0);
    recordFccUnreachable(T0 + FCC_OUTAGE_GRACE_MS);
    recordFccReached();
    expect(getFccOutageMs(T0 + FCC_OUTAGE_GRACE_MS)).toBeNull();
    recordFccUnreachable(T0 + 10 * FCC_OUTAGE_GRACE_MS);
    expect(getFccOutageMs(T0 + 10 * FCC_OUTAGE_GRACE_MS)).toBeNull();
  });

  test("an old unconfirmed outage is treated as unknown", () => {
    recordFccUnreachable(T0);
    recordFccUnreachable(T0 + FCC_OUTAGE_GRACE_MS);
    expect(getFccOutageMs(T0 + FCC_OUTAGE_GRACE_MS + FCC_OUTAGE_STALE_MS + 1)).toBeNull();
  });

  test("subscribers hear about failures and recovery", () => {
    const listener = jest.fn();
    subscribeFccOutage(listener);
    recordFccUnreachable(T0);
    recordFccReached();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
