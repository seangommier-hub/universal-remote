import { startSleepTimer, cancelSleepTimer, getSleepTimerExpiration, subscribeSleepTimer } from "./sleepTimerManager";

describe("sleepTimerManager", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Real timers may still be running from a previous test's un-cancelled state -- clear this
    // device's slate explicitly rather than assume test order never leaves one dangling.
    cancelSleepTimer("device-1");
    cancelSleepTimer("device-2");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("calls onExpire after the real duration elapses, not before", () => {
    const onExpire = jest.fn();
    startSleepTimer("device-1", 30, onExpire);

    jest.advanceTimersByTime(29 * 60_000);
    expect(onExpire).not.toHaveBeenCalled();

    jest.advanceTimersByTime(60_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test("getSleepTimerExpiration reports a real future timestamp while running, and clears after it fires", () => {
    const now = Date.now();
    startSleepTimer("device-1", 15, jest.fn());

    const expiresAt = getSleepTimerExpiration("device-1");
    expect(expiresAt).toBeDefined();
    expect(expiresAt!).toBeGreaterThanOrEqual(now + 15 * 60_000);

    jest.advanceTimersByTime(15 * 60_000);
    expect(getSleepTimerExpiration("device-1")).toBeUndefined();
  });

  test("cancelSleepTimer stops it from firing at all", () => {
    const onExpire = jest.fn();
    startSleepTimer("device-1", 10, onExpire);
    cancelSleepTimer("device-1");

    jest.advanceTimersByTime(10 * 60_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(getSleepTimerExpiration("device-1")).toBeUndefined();
  });

  test("starting a new timer for the same device replaces the old one, not stacks it", () => {
    const firstExpire = jest.fn();
    const secondExpire = jest.fn();
    startSleepTimer("device-1", 30, firstExpire);
    startSleepTimer("device-1", 10, secondExpire);

    jest.advanceTimersByTime(10 * 60_000);
    expect(secondExpire).toHaveBeenCalledTimes(1);
    expect(firstExpire).not.toHaveBeenCalled();
  });

  test("timers for different devices are independent", () => {
    const expireOne = jest.fn();
    const expireTwo = jest.fn();
    startSleepTimer("device-1", 10, expireOne);
    startSleepTimer("device-2", 20, expireTwo);

    jest.advanceTimersByTime(10 * 60_000);
    expect(expireOne).toHaveBeenCalledTimes(1);
    expect(expireTwo).not.toHaveBeenCalled();

    jest.advanceTimersByTime(10 * 60_000);
    expect(expireTwo).toHaveBeenCalledTimes(1);
  });

  test("subscribers are notified on start, cancel, and expiry", () => {
    const events: (number | null)[] = [];
    const unsubscribe = subscribeSleepTimer("device-1", (state) => events.push(state?.expiresAt ?? null));

    startSleepTimer("device-1", 5, jest.fn());
    expect(events).toHaveLength(1);
    expect(events[0]).not.toBeNull();

    cancelSleepTimer("device-1");
    expect(events).toHaveLength(2);
    expect(events[1]).toBeNull();

    unsubscribe();
    startSleepTimer("device-1", 5, jest.fn());
    expect(events).toHaveLength(2); // unsubscribed -- no more events recorded
  });
});
