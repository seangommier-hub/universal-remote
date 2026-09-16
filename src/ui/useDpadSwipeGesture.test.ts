import { resolveSwipeDirection, shouldClaimDpadSwipe } from "./useDpadSwipeGesture";

// Same honesty standard as useSwipeBackGesture.test.ts's own header comment: no real device or
// emulator was available this session to verify these gestures end-to-end (specifically, whether
// MOVEMENT_THRESHOLD is generous enough to never intercept a deliberate tap on one of the d-pad's
// own arrow buttons underneath). These pure-function unit tests are the available verification.

const MOVEMENT_THRESHOLD = 36; // must match useDpadSwipeGesture.ts's own constant

describe("shouldClaimDpadSwipe", () => {
  test("does not claim a tap-sized wobble", () => {
    expect(shouldClaimDpadSwipe(2, -1)).toBe(false);
  });

  test("does not claim right at the threshold", () => {
    expect(shouldClaimDpadSwipe(MOVEMENT_THRESHOLD - 1, 0)).toBe(false);
  });

  test("claims once movement clears the threshold on the horizontal axis", () => {
    expect(shouldClaimDpadSwipe(MOVEMENT_THRESHOLD + 1, 0)).toBe(true);
  });

  test("claims once movement clears the threshold on the vertical axis", () => {
    expect(shouldClaimDpadSwipe(0, MOVEMENT_THRESHOLD + 1)).toBe(true);
  });

  test("claims based on whichever axis moved further, even if the other axis is small", () => {
    expect(shouldClaimDpadSwipe(5, MOVEMENT_THRESHOLD + 10)).toBe(true);
  });
});

describe("resolveSwipeDirection", () => {
  test("resolves a clear rightward swipe", () => {
    expect(resolveSwipeDirection(MOVEMENT_THRESHOLD + 20, 2)).toBe("right");
  });

  test("resolves a clear leftward swipe", () => {
    expect(resolveSwipeDirection(-(MOVEMENT_THRESHOLD + 20), 2)).toBe("left");
  });

  test("resolves a clear downward swipe", () => {
    expect(resolveSwipeDirection(2, MOVEMENT_THRESHOLD + 20)).toBe("down");
  });

  test("resolves a clear upward swipe", () => {
    expect(resolveSwipeDirection(2, -(MOVEMENT_THRESHOLD + 20))).toBe("up");
  });

  test("returns null for movement that never clears the threshold", () => {
    expect(resolveSwipeDirection(10, 5)).toBeNull();
  });

  test("returns null for a genuinely diagonal drag rather than guessing which axis was meant", () => {
    expect(resolveSwipeDirection(MOVEMENT_THRESHOLD + 20, MOVEMENT_THRESHOLD + 18)).toBeNull();
  });

  test("resolves in favor of the clearly dominant axis even when both exceed the threshold", () => {
    expect(resolveSwipeDirection(MOVEMENT_THRESHOLD + 60, MOVEMENT_THRESHOLD + 2)).toBe("right");
  });
});
