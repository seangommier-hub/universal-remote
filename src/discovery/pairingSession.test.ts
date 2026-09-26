import { formatCountdown, PAIRING_CONNECTED_HOLD_MS, PAIRING_TICK_MS, PairingSession, PairingSessionState } from "./pairingSession";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("PairingSession", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function record(session: PairingSession): PairingSessionState[] {
    const seen: PairingSessionState[] = [];
    session.subscribe((state) => seen.push(state));
    return seen;
  }

  it("counts down once per second against the real time limit", () => {
    const session = new PairingSession();
    session.start({ totalMs: 30000, run: () => new Promise<string>(() => {}), onDone: jest.fn() });
    expect(session.getState()).toMatchObject({ phase: "waiting", remainingMs: 30000, totalMs: 30000, attempt: 1 });
    jest.advanceTimersByTime(PAIRING_TICK_MS * 6);
    expect(session.getState()).toMatchObject({ phase: "waiting", remainingMs: 24000 });
    session.dispose();
  });

  it("stops at zero without failing by itself, leaving the timeout to the driver", () => {
    const session = new PairingSession();
    session.start({ totalMs: 3000, run: () => new Promise<string>(() => {}), onDone: jest.fn() });
    jest.advanceTimersByTime(10000);
    expect(session.getState()).toMatchObject({ phase: "waiting", remainingMs: 0 });
    session.dispose();
  });

  it("shows Connected then calls onDone with the result after the hold", async () => {
    const onDone = jest.fn();
    const session = new PairingSession();
    session.start({ totalMs: 30000, run: async () => "device", onDone });
    await jest.advanceTimersByTimeAsync(0);
    expect(session.getState()).toEqual({ phase: "connected" });
    expect(onDone).not.toHaveBeenCalled();
    jest.advanceTimersByTime(PAIRING_CONNECTED_HOLD_MS);
    expect(onDone).toHaveBeenCalledWith("device");
  });

  it("skips the hold when connectedHoldMs is 0", async () => {
    const onDone = jest.fn();
    const session = new PairingSession();
    session.start({ totalMs: null, run: async () => 7, onDone, connectedHoldMs: 0 });
    await jest.advanceTimersByTimeAsync(0);
    expect(onDone).toHaveBeenCalledWith(7);
  });

  it("fails with the run's error and stops the countdown", async () => {
    const error = new Error("nope");
    const session = new PairingSession();
    session.start({ totalMs: 30000, run: () => Promise.reject(error), onDone: jest.fn() });
    await jest.advanceTimersByTimeAsync(0);
    expect(session.getState()).toEqual({ phase: "failed", error });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("retry restarts the same step with a fresh countdown and a new attempt number", async () => {
    let calls = 0;
    const session = new PairingSession();
    session.start({
      totalMs: 20000,
      run: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error("first")) : new Promise<string>(() => {});
      },
      onDone: jest.fn(),
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(session.getState().phase).toBe("failed");
    session.retry();
    expect(session.getState()).toMatchObject({ phase: "waiting", remainingMs: 20000, attempt: 2 });
    expect(calls).toBe(2);
    session.dispose();
  });

  it("cancel clears every timer and never calls onDone for a late success", async () => {
    const gate = deferred<string>();
    const onDone = jest.fn();
    const discard = jest.fn();
    const session = new PairingSession();
    session.start({ totalMs: 30000, run: () => gate.promise, onDone, discard });
    session.cancel();
    expect(session.getState()).toEqual({ phase: "cancelled" });
    expect(jest.getTimerCount()).toBe(0);
    gate.resolve("late-device");
    await jest.advanceTimersByTimeAsync(PAIRING_CONNECTED_HOLD_MS * 2);
    expect(onDone).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledWith("late-device");
    expect(session.getState()).toEqual({ phase: "cancelled" });
  });

  it("ignores a late failure after cancel", async () => {
    const gate = deferred<string>();
    const session = new PairingSession();
    session.start({ totalMs: 30000, run: () => gate.promise, onDone: jest.fn() });
    session.cancel();
    gate.reject(new Error("late"));
    await jest.advanceTimersByTimeAsync(0);
    expect(session.getState()).toEqual({ phase: "cancelled" });
  });

  it("discards a connected result when cancelled during the Connected hold", async () => {
    const onDone = jest.fn();
    const discard = jest.fn();
    const session = new PairingSession();
    session.start({ totalMs: 30000, run: async () => "device", onDone, discard });
    await jest.advanceTimersByTimeAsync(0);
    session.cancel();
    jest.advanceTimersByTime(PAIRING_CONNECTED_HOLD_MS * 2);
    expect(onDone).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledWith("device");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("cancel ends a pending sleep immediately so no timer is left behind", async () => {
    let finished = false;
    const session = new PairingSession();
    session.start({
      totalMs: 60000,
      run: async ({ sleep }) => {
        await sleep(2000);
        finished = true;
        return "x";
      },
      onDone: jest.fn(),
    });
    session.cancel();
    await jest.advanceTimersByTimeAsync(0);
    expect(finished).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("reports isCancelled to the running step", () => {
    let observed: (() => boolean) | null = null;
    const session = new PairingSession();
    session.start({
      totalMs: null,
      run: (context) => {
        observed = context.isCancelled;
        return new Promise<string>(() => {});
      },
      onDone: jest.fn(),
    });
    expect(observed!()).toBe(false);
    session.cancel();
    expect(observed!()).toBe(true);
  });

  it("starting a new step supersedes the old one and discards its late result", async () => {
    const first = deferred<string>();
    const discard = jest.fn();
    const session = new PairingSession();
    session.start({ totalMs: 30000, run: () => first.promise, onDone: jest.fn(), discard });
    session.start({ totalMs: 30000, run: () => new Promise<string>(() => {}), onDone: jest.fn() });
    first.resolve("stale");
    await jest.advanceTimersByTimeAsync(0);
    expect(discard).toHaveBeenCalledWith("stale");
    expect(session.getState()).toMatchObject({ phase: "waiting", attempt: 2 });
    session.dispose();
  });

  it("dispose stops timers and notifies nobody", () => {
    const session = new PairingSession();
    const seen = record(session);
    session.start({ totalMs: 30000, run: () => new Promise<string>(() => {}), onDone: jest.fn() });
    const before = seen.length;
    session.dispose();
    jest.advanceTimersByTime(60000);
    expect(seen.length).toBe(before);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("hides the countdown for an open-ended step", () => {
    const session = new PairingSession();
    session.start({ totalMs: null, run: () => new Promise<string>(() => {}), onDone: jest.fn() });
    expect(session.getState()).toMatchObject({ phase: "waiting", totalMs: null });
    expect(jest.getTimerCount()).toBe(0);
    session.dispose();
  });
});

describe("formatCountdown", () => {
  it("formats minutes and zero-padded seconds, rounding partial seconds up", () => {
    expect(formatCountdown(30000)).toBe("0:30");
    expect(formatCountdown(24500)).toBe("0:25");
    expect(formatCountdown(60000)).toBe("1:00");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
