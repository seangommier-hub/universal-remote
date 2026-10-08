import { FIT_GROW_THRESHOLD_PX, FIT_SAFETY_MARGIN_PX, FIT_SCALE_FLOOR, FIT_SCALE_GROW_CEILING, FIT_TOLERANCE_PX, maxFitScaleFor, nextFitScale } from "./fitScale";

describe("maxFitScaleFor", () => {
  test("is capped by the grow ceiling when there is plenty of combined headroom", () => {
    expect(maxFitScaleFor(1, 5)).toBe(FIT_SCALE_GROW_CEILING);
  });

  test("is capped by the combined (width x fit) scale when that is the tighter bound", () => {
    expect(maxFitScaleFor(1.2, 1.5)).toBeCloseTo(1.25, 5);
  });

  test("never drops below 1: a window already past its combined cap just does not grow", () => {
    expect(maxFitScaleFor(1.35, 1.0)).toBe(1);
  });
});

describe("nextFitScale", () => {
  test("content that fits with only a little spare (inside the dead band) leaves fitScale unchanged", () => {
    expect(nextFitScale(1, 800, 770)).toBe(1);
    expect(nextFitScale(0.9, 800, 770)).toBe(0.9);
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

  test("a value already past the grow ceiling is left alone when it fits, and shrinks when it doesn't", () => {
    expect(nextFitScale(1.5, 800, 700)).toBe(1.5);
    expect(nextFitScale(1.5, 100, 1000)).toBe(FIT_SCALE_FLOOR);
  });

  // ADR-HEARTH-219: bigger phones (Pro Max) grow the remote into spare height.
  test("real spare height grows fitScale, never past the cap", () => {
    expect(nextFitScale(1, 932, 600)).toBeGreaterThan(1);
    expect(nextFitScale(1, 2000, 600)).toBe(FIT_SCALE_GROW_CEILING);
    expect(nextFitScale(1, 2000, 600, 1.2)).toBe(1.2);
  });

  test("a small amount of spare (inside the dead band) does not grow", () => {
    const target = 800 - FIT_SAFETY_MARGIN_PX;
    expect(nextFitScale(1, 800, target - FIT_GROW_THRESHOLD_PX)).toBe(1);
  });

  test("growth approaches the fit from below and never overshoots into overflow", () => {
    // content = fixed + scalable * fit, like the real screen
    let fit = 1;
    const available = 932;
    for (let i = 0; i < 20; i++) {
      const content = 450 + 300 * fit;
      fit = nextFitScale(fit, available, content);
      expect(450 + 300 * fit).toBeLessThanOrEqual(available - FIT_SAFETY_MARGIN_PX);
    }
    expect(fit).toBeGreaterThan(1.2);
  });

  test("grow then shrink never chase each other: once settled, the same measurement is stable", () => {
    let fit = 1;
    const available = 932;
    for (let i = 0; i < 30; i++) fit = nextFitScale(fit, available, 450 + 300 * fit);
    expect(nextFitScale(fit, available, 450 + 300 * fit)).toBe(fit);
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
