import { shouldStartSwipeBack, shouldClaimSwipeBack, isCompletedSwipeBack, EDGE_ZONE_WIDTH, SWIPE_THRESHOLD, DIRECTION_LOCK_DISTANCE } from "./useSwipeBackGesture";

// Real-hardware finding (2026-09-12): the Android emulator built for tonight's live-hardware
// testing could not verify this gesture end-to-end — Android's own system gesture navigation
// intercepts a left-edge swipe before this component's PanResponder ever sees it (confirmed live,
// twice, including with the swipe start nudged inward). These pure-function unit tests are the
// available verification given that platform-level wall; see useSwipeBackGesture.ts's own comment
// for the full account.

describe("shouldStartSwipeBack", () => {
  test("claims a touch starting at the very left edge", () => {
    expect(shouldStartSwipeBack(0)).toBe(true);
  });

  test("claims a touch starting exactly at the edge zone boundary", () => {
    expect(shouldStartSwipeBack(EDGE_ZONE_WIDTH)).toBe(true);
  });

  test("ignores a touch starting just past the edge zone", () => {
    expect(shouldStartSwipeBack(EDGE_ZONE_WIDTH + 1)).toBe(false);
  });

  test("ignores a touch starting mid-screen", () => {
    expect(shouldStartSwipeBack(200)).toBe(false);
  });
});

describe("shouldClaimSwipeBack", () => {
  test("does not claim before the direction-lock distance is reached", () => {
    expect(shouldClaimSwipeBack(0, DIRECTION_LOCK_DISTANCE - 1, 0)).toBe(false);
  });

  test("claims a clear rightward horizontal drag from the edge", () => {
    expect(shouldClaimSwipeBack(0, DIRECTION_LOCK_DISTANCE + 5, 0)).toBe(true);
  });

  test("releases to the ScrollView for a clear vertical drag", () => {
    expect(shouldClaimSwipeBack(0, 0, DIRECTION_LOCK_DISTANCE + 5)).toBe(false);
  });

  test("releases a diagonal drag that is more vertical than horizontal", () => {
    expect(shouldClaimSwipeBack(0, 5, 20)).toBe(false);
  });

  test("claims a diagonal drag that is more horizontal than vertical", () => {
    expect(shouldClaimSwipeBack(0, 20, 5)).toBe(true);
  });

  test("does not claim a leftward drag started outside the edge zone", () => {
    // A touch that started mid-screen (locationX > EDGE_ZONE_WIDTH) moving further left/away from
    // the edge should never be mistaken for a back-swipe, regardless of distance moved.
    expect(shouldClaimSwipeBack(200, -50, 0)).toBe(false);
  });
});

describe("isCompletedSwipeBack", () => {
  test("does not complete at exactly the threshold", () => {
    expect(isCompletedSwipeBack(SWIPE_THRESHOLD)).toBe(false);
  });

  test("completes just past the threshold", () => {
    expect(isCompletedSwipeBack(SWIPE_THRESHOLD + 1)).toBe(true);
  });

  test("does not complete for a short drag", () => {
    expect(isCompletedSwipeBack(10)).toBe(false);
  });

  test("does not complete for a leftward release", () => {
    expect(isCompletedSwipeBack(-100)).toBe(false);
  });
});
