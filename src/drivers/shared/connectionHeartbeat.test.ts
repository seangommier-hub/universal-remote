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
});
