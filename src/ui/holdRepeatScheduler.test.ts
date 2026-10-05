import { HOLD_REPEAT_INITIAL_DELAY_MS, HOLD_REPEAT_INTERVAL_MS, HoldRepeatScheduler } from "./holdRepeatScheduler";

describe("HoldRepeatScheduler", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("a quick tap (start then stop before the initial delay) fires exactly once", () => {
    const repeatAction = jest.fn();
    const scheduler = new HoldRepeatScheduler();
    scheduler.start(repeatAction);
    scheduler.stop();
    jest.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 3);
    expect(repeatAction).toHaveBeenCalledTimes(1);
  });

  test("held past the initial delay repeats on the interval until stop()", () => {
    const repeatAction = jest.fn();
    const scheduler = new HoldRepeatScheduler();
    scheduler.start(repeatAction);
    expect(repeatAction).toHaveBeenCalledTimes(1); // the immediate fire

    jest.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS);
    expect(repeatAction).toHaveBeenCalledTimes(1); // still just the immediate fire -- the delay only arms the interval

    jest.advanceTimersByTime(HOLD_REPEAT_INTERVAL_MS * 3);
    expect(repeatAction).toHaveBeenCalledTimes(4); // immediate + 3 interval repeats

    scheduler.stop();
    jest.advanceTimersByTime(HOLD_REPEAT_INTERVAL_MS * 5);
    expect(repeatAction).toHaveBeenCalledTimes(4); // nothing further after stop()
  });

  // ADR-HEARTH-211/204: left/right's genuine first press still registers with the seek-multiplier
  // tap-streak tracker (onFirstPress), but a held repeat must NOT -- ADR-HEARTH-204 is explicit
  // that escalation comes from real taps only, never a hold timer.
  test("onFirstPress fires instead of repeatAction on the immediate press, but repeats still use repeatAction", () => {
    const repeatAction = jest.fn();
    const onFirstPress = jest.fn();
    const scheduler = new HoldRepeatScheduler();
    scheduler.start(repeatAction, onFirstPress);

    expect(onFirstPress).toHaveBeenCalledTimes(1);
    expect(repeatAction).not.toHaveBeenCalled();

    jest.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS + HOLD_REPEAT_INTERVAL_MS * 2);
    expect(onFirstPress).toHaveBeenCalledTimes(1); // never called again
    expect(repeatAction).toHaveBeenCalledTimes(2); // only the repeats use the plain action
  });

  test("stop() before any start() is a safe no-op", () => {
    expect(() => new HoldRepeatScheduler().stop()).not.toThrow();
  });

  test("a second start() without a stop() between them never stacks two repeat loops", () => {
    const repeatAction = jest.fn();
    const scheduler = new HoldRepeatScheduler();
    scheduler.start(repeatAction);
    scheduler.start(repeatAction); // e.g. a stray duplicate press-in event
    jest.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS + HOLD_REPEAT_INTERVAL_MS);
    // 2 immediate fires (one per start()) + exactly 1 interval repeat, not 2 -- the first start()'s
    // own interval was torn down by the second start()'s defensive stop().
    expect(repeatAction).toHaveBeenCalledTimes(3);
  });

  test("custom delay/interval are honored", () => {
    const repeatAction = jest.fn();
    const scheduler = new HoldRepeatScheduler(100, 50);
    scheduler.start(repeatAction);
    jest.advanceTimersByTime(99);
    expect(repeatAction).toHaveBeenCalledTimes(1); // just the immediate fire, delay not yet elapsed
    jest.advanceTimersByTime(1 + 50);
    expect(repeatAction).toHaveBeenCalledTimes(2);
  });
});
