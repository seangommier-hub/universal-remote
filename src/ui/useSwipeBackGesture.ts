import { useRef } from "react";
import { GestureResponderEvent, PanResponder, PanResponderGestureState } from "react-native";

// Sean, directly (2026-09-12): "add swiping to go back." Uses React Native's built-in
// PanResponder rather than adding react-native-gesture-handler as a dependency — confirmed via
// Expo's own SDK 57 docs that gesture-handler IS Expo-Go-compatible, but a plain edge-swipe-to-go-
// back gesture (a discrete "did they drag past a threshold" check, not a frame-perfect animated
// drag-along transition) doesn't need a native-thread gesture library. PanResponder ships in core
// React Native — zero new dependency, no GestureHandlerRootView wrapping required anywhere.
//
// Verification note: the Android emulator built for tonight's live-hardware testing could not
// verify this end-to-end — Android's own system gesture navigation intercepts a left-edge swipe
// before this component's PanResponder ever receives the touch (confirmed live: the same swipe
// that should trigger onBack instead exited the whole app to the Android home screen, both at the
// literal edge and with the start point nudged inward). This is a platform-level OS gesture
// conflict, not something an app's JS can suppress, and not a Hearth bug — switching the emulator
// to 3-button navigation via `adb shell settings put secure navigation_mode 0` did not change the
// behavior either (this AVD's system UI evidently doesn't react to that key without a restart this
// session didn't pursue). iOS has no equivalent always-on system edge-gesture reservation for a
// plain running app (that's specific to UINavigationController's own interactive-pop gesture,
// which this app doesn't use), so this conflict may simply not exist on Sean's actual iPhone — but
// that is unverified, not confirmed either way. The predicate functions below are unit-tested
// directly (see useSwipeBackGesture.test.ts) since the platform wall prevented an end-to-end check.

// Only a touch starting within this many px of the left edge begins tracking — the standard iOS
// edge-swipe-back zone, so a normal tap/scroll starting mid-screen is never mistaken for this
// gesture.
export const EDGE_ZONE_WIDTH = 32;
// Minimum rightward drag before the gesture is considered a deliberate "go back" rather than an
// incidental finger wobble.
export const SWIPE_THRESHOLD = 80;
// Once a touch inside the edge zone has moved this many px in either axis, decide once whether
// it's a horizontal swipe (claim it) or a vertical scroll (release it back to the ScrollView) —
// checked via the ratio below, not an absolute vertical cap, so it works the same on any screen.
export const DIRECTION_LOCK_DISTANCE = 10;

/** Pure predicate for onStartShouldSetPanResponder — extracted for direct unit testing. */
export function shouldStartSwipeBack(locationX: number): boolean {
  return locationX <= EDGE_ZONE_WIDTH;
}

/** Pure predicate for onMoveShouldSetPanResponder — extracted for direct unit testing. */
export function shouldClaimSwipeBack(locationX: number, dx: number, dy: number): boolean {
  if (locationX > EDGE_ZONE_WIDTH && dx <= 0) return false;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (distance < DIRECTION_LOCK_DISTANCE) return false;
  return Math.abs(dx) > Math.abs(dy);
}

/** Pure predicate for onPanResponderRelease — extracted for direct unit testing. */
export function isCompletedSwipeBack(dx: number): boolean {
  return dx > SWIPE_THRESHOLD;
}

/**
 * Returns PanResponder handlers for a left-edge swipe-right gesture that calls `onBack`. Spread
 * the result onto a plain View wrapping a screen's content (not onto the ScrollView itself —
 * PanResponder and ScrollView's own internal responder can otherwise fight over the gesture).
 */
export function useSwipeBackGesture(onBack: () => void) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (event: GestureResponderEvent) => shouldStartSwipeBack(event.nativeEvent.locationX),
      onMoveShouldSetPanResponder: (event: GestureResponderEvent, gesture: PanResponderGestureState) =>
        shouldClaimSwipeBack(event.nativeEvent.locationX, gesture.dx, gesture.dy),
      onPanResponderRelease: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
        if (isCompletedSwipeBack(gesture.dx)) onBackRef.current();
      },
    })
  ).current;

  return panResponder.panHandlers;
}
