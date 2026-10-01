import { TAP_STREAK_WINDOW_MS, TapStreakTracker, multiplierForTapCount } from "./tapStreak";

describe("multiplierForTapCount", () => {
  test("the first tap of a streak is normal speed (no escalation)", () => {
    expect(multiplierForTapCount(1)).toBe(1);
  });

  test("escalates 2x, 5x, 10x, 20x on taps 2 through 5", () => {
    expect(multiplierForTapCount(2)).toBe(2);
    expect(multiplierForTapCount(3)).toBe(5);
    expect(multiplierForTapCount(4)).toBe(10);
    expect(multiplierForTapCount(5)).toBe(20);
  });

  test("wraps back to normal speed after 20x, per Sean's own spec, rather than staying pinned", () => {
    expect(multiplierForTapCount(6)).toBe(1);
    expect(multiplierForTapCount(7)).toBe(2);
    expect(multiplierForTapCount(10)).toBe(20);
    expect(multiplierForTapCount(11)).toBe(1);
  });

  test("a tap count below 1 is treated the same as the first tap", () => {
    expect(multiplierForTapCount(0)).toBe(1);
    expect(multiplierForTapCount(-5)).toBe(1);
  });
});

describe("TapStreakTracker", () => {
  // Deterministic, controllable clock instead of real Date.now() / jest fake timers — this class
  // takes `now` as a plain function dependency (same style as backoffJitter's injectable
  // randomness), so advancing "time" here is just incrementing a variable.
  function makeClock(startMs = 0) {
    let current = startMs;
    return { now: () => current, advance: (ms: number) => (current += ms) };
  }

  test("a single tap is normal speed", () => {
    const clock = makeClock();
    const tracker = new TapStreakTracker(TAP_STREAK_WINDOW_MS, clock.now);
    expect(tracker.recordTap("left").multiplier).toBe(1);
  });

  test("consecutive same-direction taps within the window escalate 1x -> 2x -> 5x -> 10x -> 20x", () => {
    const clock = makeClock();
    const tracker = new TapStreakTracker(TAP_STREAK_WINDOW_MS, clock.now);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      seen.push(tracker.recordTap("left").multiplier);
      clock.advance(100);
    }
    expect(seen).toEqual([1, 2, 5, 10, 20]);
  });

  test("a 6th rapid same-direction tap wraps back to normal speed, then escalates again", () => {
    const clock = makeClock();
    const tracker = new TapStreakTracker(TAP_STREAK_WINDOW_MS, clock.now);
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) {
      seen.push(tracker.recordTap("right").multiplier);
      clock.advance(100);
    }
    expect(seen).toEqual([1, 2, 5, 10, 20, 1, 2]);
  });

  test("a tap on the other direction restarts the streak at normal speed", () => {
    const clock = makeClock();
    const tracker = new TapStreakTracker(TAP_STREAK_WINDOW_MS, clock.now);
    tracker.recordTap("left");
    clock.advance(100);
    expect(tracker.recordTap("left").multiplier).toBe(2);
    clock.advance(100);
    // Switching direction mid-streak is a fresh streak, not a continuation of the left streak's level.
    expect(tracker.recordTap("right").multiplier).toBe(1);
  });

  test("a tap exactly at the window boundary still continues the streak", () => {
    const clock = makeClock();
    const tracker = new TapStreakTracker(TAP_STREAK_WINDOW_MS, clock.now);
    tracker.recordTap("left");
    clock.advance(TAP_STREAK_WINDOW_MS);
    expect(tracker.recordTap("left").multiplier).toBe(2);
  });

  test("a tap one ms past the window resets the streak to normal speed, not the next tier up", () => {
    const clock = makeClock();
    const tracker = new TapStreakTracker(TAP_STREAK_WINDOW_MS, clock.now);
    tracker.recordTap("left");
    clock.advance(100);
    tracker.recordTap("left"); // now at 2x
    clock.advance(TAP_STREAK_WINDOW_MS + 1); // pause longer than the window
    expect(tracker.recordTap("left").multiplier).toBe(1);
  });
});
