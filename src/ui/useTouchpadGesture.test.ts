import { isTouchpadTap } from "./useTouchpadGesture";

// Same honesty standard as useDpadSwipeGesture.test.ts's own header comment: no real device or
// emulator was available this session to verify end-to-end (specifically, whether TAP_MAX_MOVEMENT
// and MOVE_FLUSH_INTERVAL_MS feel right on a real touchscreen). This pure-function unit test is
// the available verification for the tap-vs-drag classification; the PanResponder wiring itself
// (onPanResponderGrant/Move/Release) is exercised only indirectly through this predicate.

const TAP_MAX_MOVEMENT = 8; // must match useTouchpadGesture.ts's own constant

describe("isTouchpadTap", () => {
  test("a stationary tap (zero movement) counts as a tap", () => {
    expect(isTouchpadTap(0, 0)).toBe(true);
  });

  test("ordinary finger wobble within the limit still counts as a tap", () => {
    expect(isTouchpadTap(3, -2)).toBe(true);
  });

  test("right at the limit still counts as a tap", () => {
    expect(isTouchpadTap(TAP_MAX_MOVEMENT, 0)).toBe(true);
  });

  test("movement just past the limit on the horizontal axis is a drag, not a tap", () => {
    expect(isTouchpadTap(TAP_MAX_MOVEMENT + 1, 0)).toBe(false);
  });

  test("movement just past the limit on the vertical axis is a drag, not a tap", () => {
    expect(isTouchpadTap(0, TAP_MAX_MOVEMENT + 1)).toBe(false);
  });

  test("classifies based on whichever axis moved further", () => {
    expect(isTouchpadTap(2, TAP_MAX_MOVEMENT + 10)).toBe(false);
  });

  test("negative deltas are treated the same as positive ones", () => {
    expect(isTouchpadTap(-(TAP_MAX_MOVEMENT + 1), 0)).toBe(false);
  });
});
