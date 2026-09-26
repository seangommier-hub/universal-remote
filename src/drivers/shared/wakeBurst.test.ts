import { WakeBurstController } from "./wakeBurst";

const INTERVAL = 2000;
const WINDOW = 10000;

describe("WakeBurstController", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("stops as soon as the device answers on the third attempt", async () => {
    const attempt = jest.fn().mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
    const onExhausted = jest.fn();
    const burst = new WakeBurstController();
    burst.start("tv", attempt, onExhausted, INTERVAL, WINDOW);
    await jest.advanceTimersByTimeAsync(INTERVAL * 10);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onExhausted).not.toHaveBeenCalled();
    expect(burst.isActive("tv")).toBe(false);
  });

  it("gives up after the window and calls onExhausted exactly once", async () => {
    const attempt = jest.fn().mockRejectedValue(new Error("down"));
    const onExhausted = jest.fn();
    const burst = new WakeBurstController();
    burst.start("tv", attempt, onExhausted, INTERVAL, WINDOW);
    await jest.advanceTimersByTimeAsync(WINDOW * 5);
    expect(attempt).toHaveBeenCalledTimes(WINDOW / INTERVAL);
    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(burst.isActive("tv")).toBe(false);
  });

  it("stop() cancels the burst without calling onExhausted", async () => {
    const attempt = jest.fn().mockRejectedValue(new Error("down"));
    const onExhausted = jest.fn();
    const burst = new WakeBurstController();
    burst.start("tv", attempt, onExhausted, INTERVAL, WINDOW);
    await jest.advanceTimersByTimeAsync(INTERVAL);
    burst.stop("tv");
    await jest.advanceTimersByTimeAsync(WINDOW * 5);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it("never overlaps attempts while one is still in flight", async () => {
    let running = 0;
    let maxRunning = 0;
    const attempt = jest.fn(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, INTERVAL * 3));
      running -= 1;
      throw new Error("down");
    });
    const burst = new WakeBurstController();
    burst.start("tv", attempt, jest.fn(), INTERVAL, WINDOW);
    await jest.advanceTimersByTimeAsync(INTERVAL * 20);
    expect(maxRunning).toBe(1);
  });

  it("restarting replaces the previous burst instead of running two", async () => {
    const first = jest.fn().mockRejectedValue(new Error("down"));
    const second = jest.fn().mockRejectedValue(new Error("down"));
    const burst = new WakeBurstController();
    burst.start("tv", first, jest.fn(), INTERVAL, WINDOW);
    burst.start("tv", second, jest.fn(), INTERVAL, WINDOW);
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
  it("reports activity true on start and false on answer, exhaustion and stop", async () => {
    const changes: Array<[string, boolean]> = [];
    const burst = new WakeBurstController((id, active) => changes.push([id, active]));

    burst.start("a", jest.fn().mockResolvedValue(undefined), jest.fn(), INTERVAL, WINDOW);
    await jest.advanceTimersByTimeAsync(INTERVAL);
    burst.start("b", jest.fn().mockRejectedValue(new Error("down")), jest.fn(), INTERVAL, WINDOW);
    await jest.advanceTimersByTimeAsync(WINDOW * 2);
    burst.start("c", jest.fn().mockRejectedValue(new Error("down")), jest.fn(), INTERVAL, WINDOW);
    burst.stop("c");
    burst.stop("c");

    expect(changes).toEqual([["a", true], ["a", false], ["b", true], ["b", false], ["c", true], ["c", false]]);
  });
});
