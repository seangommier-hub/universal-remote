import { useRef } from "react";
import { GestureResponderEvent, PanResponder, PanResponderGestureState } from "react-native";
import { NavigationDirection } from "../core/types/Capability";

// Real-hardware/competitive research (2026-09-16): Apple TV Remote's single most distinguishing
// feature is a swipe-based touchpad for d-pad navigation — confirmed via Apple's own support docs
// (support.apple.com/en-us/102337) and independent writeups, not guessed. Adds swipe-to-navigate
// as an ADDITIONAL way to drive the d-pad, layered on top of (not replacing) the existing arrow
// buttons — Hearth's d-pad, unlike the real Siri Remote's single unified clickpad, already has
// discrete tap targets, and removing those in favor of gesture-only would be a bigger, riskier
// redesign than what was asked for.
//
// Same tool and testable-predicate structure as useSwipeBackGesture.ts (React Native's built-in
// PanResponder, zero new dependency; pure direction/threshold logic pulled out for direct unit
// testing rather than only reachable through a live gesture simulation) — that file's own header
// comment is the primary reference for why PanResponder over react-native-gesture-handler here.
//
// Verification note, same honesty standard as useSwipeBackGesture.ts's own: this was NOT verified
// end-to-end against a real device or emulator this session (none was available) — specifically
// unverified is whether MOVEMENT_THRESHOLD is generous enough to avoid ever intercepting a
// deliberate tap on one of the d-pad's own arrow buttons, which sit inside the same swipeable
// area. If real-device testing finds taps getting swallowed, raise this threshold first before
// assuming the gesture layer itself is wrong.
const MOVEMENT_THRESHOLD = 36;

/** Pure predicate for onMoveShouldSetPanResponder — extracted for direct unit testing. Only claims the gesture once movement clearly exceeds ordinary tap/finger wobble, so a deliberate press on one of the d-pad's own arrow buttons is left alone. */
export function shouldClaimDpadSwipe(dx: number, dy: number): boolean {
  return Math.max(Math.abs(dx), Math.abs(dy)) >= MOVEMENT_THRESHOLD;
}

/** Pure function resolving a completed drag into one of the four cardinal directions — extracted for direct unit testing. Whichever axis moved further wins; a genuinely diagonal drag (the two axes within 15% of each other) is treated as ambiguous and ignored rather than guessing which the user meant. */
export function resolveSwipeDirection(dx: number, dy: number): NavigationDirection | null {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (Math.max(absDx, absDy) < MOVEMENT_THRESHOLD) return null;
  if (Math.abs(absDx - absDy) < 0.15 * Math.max(absDx, absDy)) return null; // too diagonal to call
  if (absDx > absDy) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/**
 * Returns PanResponder handlers for swipe-to-navigate over the d-pad's own circular area. Spread
 * the result onto the same View that contains the arrow buttons (not a separate overlay) — its
 * responder-claim only activates once real movement is detected (see shouldClaimDpadSwipe), which
 * is what lets a plain tap on an arrow button underneath pass through untouched.
 */
export function useDpadSwipeGesture(onSwipe: (direction: NavigationDirection) => void) {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => shouldClaimDpadSwipe(gesture.dx, gesture.dy),
      onPanResponderRelease: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
        const direction = resolveSwipeDirection(gesture.dx, gesture.dy);
        if (direction) onSwipeRef.current(direction);
      },
    })
  ).current;

  return panResponder.panHandlers;
}
