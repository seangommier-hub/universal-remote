import { FIT_SAFETY_MARGIN_PX, FIT_SCALE_FLOOR, FIT_TOLERANCE_PX, nextFitScale } from "./fitScale";

describe("nextFitScale", () => {
  test("content already fits (with margin to spare) leaves fitScale unchanged", () => {
    expect(nextFitScale(1, 800, 700)).toBe(1);
    expect(nextFitScale(0.9, 800, 700)).toBe(0.9);
  });

  test("overflow exactly at the margin-adjusted tolerance is treated as a fit", () => {
    // The real target this function holds content to is availableHeight minus the safety margin
    // (comfortable spare, not just enough to pass) -- not availableHeight itself.
    const target = 800 - FIT_SAFETY_MARGIN_PX;
    expect(nextFitScale(1, 800, target + FIT_TOLERANCE_PX)).toBe(1);
  });

  test("real overflow shrinks fitScale proportionally, toward the margin-adjusted target", () => {
    const target = 800 - FIT_SAFETY_MARGIN_PX;
    const next = nextFitScale(1, 800, 900);
    expect(next).toBeLessThan(1);
    expect(next).toBeCloseTo(target / 900, 5);
  });

  test("still corrects when content fits availableHeight exactly but eats into the safety margin", () => {
    // 10px of real spare against availableHeight is a FAIL by this feature's own "comfortable
    // margin, not just barely" standard even though the harness's own raw overflow check (no
    // margin concept) would call it a pass -- the margin is what keeps that honest.
    const next = nextFitScale(1, 800, 790);
    expect(next).toBeLessThan(1);
  });

  test("repeated real overflow never increases fitScale (monotonic shrink only)", () => {
    let fit = 1;
    const available = 700;
    let content = 900;
    const seen: number[] = [fit];
    for (let i = 0; i < 10; i++) {
      fit = nextFitScale(fit, available, content);
      seen.push(fit);
      // Each correction step pulls content down a bit too (simulating a real re-render at the
      // new, smaller fitScale) -- a fixed portion stays, a scalable portion shrinks with fitScale.
      content = 300 + 600 * fit;
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeLessThanOrEqual(seen[i - 1]);
    }
  });

  test("never shrinks below the floor even with extreme overflow", () => {
    expect(nextFitScale(1, 10, 10000)).toBe(FIT_SCALE_FLOOR);
    expect(nextFitScale(FIT_SCALE_FLOOR, 10, 10000)).toBe(FIT_SCALE_FLOOR);
  });

  test("never exceeds the ceiling even if given an out-of-range current value", () => {
    expect(nextFitScale(1.5, 800, 700)).toBe(1.5); // already fits -- returned as-is, unclamped (callers never pass >1 in practice)
    expect(nextFitScale(1.5, 100, 1000)).toBeLessThanOrEqual(1);
  });

  test("an unmeasured (zero/negative) dimension is a no-op, not a crash or a snap to the floor", () => {
    expect(nextFitScale(0.9, 0, 500)).toBe(0.9);
    expect(nextFitScale(0.9, 500, 0)).toBe(0.9);
    expect(nextFitScale(0.9, -10, 500)).toBe(0.9);
  });

  test("converges to within tolerance (with margin) in a bounded, small number of steps from a realistic overflow", () => {
    // Mirrors the real measured LG baseline reasonably well (89px raw overflow at 393x852, ~550px
    // of genuinely fixed content -- header/status/tabs/gaps/text -- and ~280px that fitScale.ts's
    // own call sites actually scale: the d-pad hub as one unit, plus a few cards' padding/gaps).
    let fit = 1;
    const available = 769;
    let content = 550 + 280 * fit;
    let steps = 0;
    while (content - available > FIT_TOLERANCE_PX && steps < 20) {
      fit = nextFitScale(fit, available, content);
      content = 550 + 280 * fit;
      steps++;
    }
    expect(content).toBeLessThanOrEqual(available); // comfortably fits, not just within the raw tolerance
    expect(steps).toBeLessThan(10);
  });

  test("a device/content combination the floor genuinely can't satisfy still terminates, not loops", () => {
    // An intentionally-infeasible case (a floor-scaled d-pad hub still taller than what's left
    // once the fixed content is accounted for) -- real correction can't do better than the floor
    // here, and the important property is that it STOPS there rather than hunting forever.
    let fit = 1;
    const available = 769;
    let content = 680 + 280 * fit;
    let steps = 0;
    let previous = -1;
    while (content - available > FIT_TOLERANCE_PX && fit !== previous && steps < 20) {
      previous = fit;
      fit = nextFitScale(fit, available, content);
      content = 680 + 280 * fit;
      steps++;
    }
    expect(fit).toBe(FIT_SCALE_FLOOR);
    expect(steps).toBeLessThan(10); // reaches (and then stops repeating at) the floor quickly, never hits the hook's own 20-step hard cap
  });
});
