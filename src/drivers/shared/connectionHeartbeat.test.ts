import { HEARTBEAT_FAILURES_BEFORE_DEAD, startConnectionHeartbeat } from "./connectionHeartbeat";

describe("startConnectionHeartbeat", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("a healthy connection is never declared dead", async () => {
    const onDead = jest.fn();
    const stop = startConnectionHeartbeat(() => Promise.resolve(), onDead, 1000);
    await jest.advanceTimersByTimeAsync(10000);
    expect(onDead).not.toHaveBeenCalled();
    stop();
  });

  test("consecutive failures declare it dead exactly once", async () => {
    const onDead = jest.fn();
    startConnectionHeartbeat(() => Promise.reject(new Error("timed out")), onDead, 1000);
    await jest.advanceTimersByTimeAsync(1000 * (HEARTBEAT_FAILURES_BEFORE_DEAD + 5));
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  test("one failure followed by a success resets the count", async () => {
    const onDead = jest.fn();
    const check = jest.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValue(undefined);
    startConnectionHeartbeat(check, onDead, 1000);
    await jest.advanceTimersByTimeAsync(10000);
    expect(onDead).not.toHaveBeenCalled();
  });

  test("stopping prevents any further checks", async () => {
    const check = jest.fn().mockResolvedValue(undefined);
    const stop = startConnectionHeartbeat(check, jest.fn(), 1000);
    stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(check).not.toHaveBeenCalled();
  });

  describe("graceMs (ADR-HEARTH-229)", () => {
    test("failures within the grace window are tolerated, not counted toward death", async () => {
      const onDead = jest.fn();
      startConnectionHeartbeat(() => Promise.reject(new Error("still booting")), onDead, 1000, 5000);
      await jest.advanceTimersByTimeAsync(4000); // 4 failed checks, all inside the 5s grace window
      expect(onDead).not.toHaveBeenCalled();
    });

    test("a failure after the grace window elapses counts normally and can still declare death", async () => {
      const onDead = jest.fn();
      startConnectionHeartbeat(() => Promise.reject(new Error("genuinely dead")), onDead, 1000, 2000);
      await jest.advanceTimersByTimeAsync(2000 + 1000 * (HEARTBEAT_FAILURES_BEFORE_DEAD + 1));
      expect(onDead).toHaveBeenCalledTimes(1);
    });

    test("a success during the grace window still resets the count, same as always", async () => {
      const onDead = jest.fn();
      const check = jest
        .fn()
        .mockRejectedValueOnce(new Error("blip"))
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(new Error("genuinely dead"));
      startConnectionHeartbeat(check, onDead, 1000, 500);
      // Past the 500ms grace window by the time the real failures start (first two calls happen at 1s, 2s).
      await jest.advanceTimersByTimeAsync(1000 * (HEARTBEAT_FAILURES_BEFORE_DEAD + 3));
      expect(onDead).toHaveBeenCalledTimes(1);
    });

    test("omitting graceMs behaves exactly as before this ADR (an immediate failure can count)", async () => {
      const onDead = jest.fn();
      startConnectionHeartbeat(() => Promise.reject(new Error("timed out")), onDead, 1000);
      await jest.advanceTimersByTimeAsync(1000 * (HEARTBEAT_FAILURES_BEFORE_DEAD + 1));
      expect(onDead).toHaveBeenCalledTimes(1);
    });
  });
});
