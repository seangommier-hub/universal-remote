import { useCallback, useRef } from "react";
import { GestureResponderEvent, PanResponder, PanResponderGestureState } from "react-native";

// Real ask (2026-10-06, Sean, directly): "the mouse is not working nor keyboard" -- trying to use
// Hearth to drive Family Command Center's own dashboard, now shown in the LG's built-in browser.
// Hearth never had real pointer/mouse control at all (LgWebOsDriver.ts's pointerMove/pointerClick
// entry has the full root cause); this is the touchpad gesture surface that drives it. Same tool
// and testable-predicate structure as useDpadSwipeGesture.ts/useSwipeBackGesture.ts (React
// Native's built-in PanResponder, pure logic pulled out for direct unit testing).

/** How often accumulated movement is flushed as one pointerMove command, instead of one command
 * per raw touch-move event (which can fire dozens of times a second) -- smooths the motion on the
 * TV side and keeps the command rate reasonable over the LAN. */
const MOVE_FLUSH_INTERVAL_MS = 40;
/** Total movement (px) a gesture can have and still count as a tap-to-click rather than a drag --
 * matches ordinary finger wobble on a real trackpad tap, not a deliberate swipe. */
const TAP_MAX_MOVEMENT = 8;

/** Pure predicate for "was this a tap (click) or a drag (just movement, no click)" — extracted for
 * direct unit testing, same shape as useDpadSwipeGesture.ts's shouldClaimDpadSwipe. */
export function isTouchpadTap(totalDx: number, totalDy: number): boolean {
  return Math.max(Math.abs(totalDx), Math.abs(totalDy)) <= TAP_MAX_MOVEMENT;
}

export interface TouchpadGestureHandlers {
  onStartShouldSetPanResponder: () => boolean;
  onMoveShouldSetPanResponder: () => boolean;
  onPanResponderGrant: () => void;
  onPanResponderMove: (event: GestureResponderEvent, gesture: PanResponderGestureState) => void;
  onPanResponderRelease: (event: GestureResponderEvent, gesture: PanResponderGestureState) => void;
  onPanResponderTerminate: (event: GestureResponderEvent, gesture: PanResponderGestureState) => void;
}

/**
 * Returns PanResponder handlers for a touchpad surface: streams relative (dx, dy) movement to
 * `onMove` at a fixed interval while dragging (gesture.dx/dy are cumulative-since-grant, so this
 * tracks the previous cumulative value itself to derive each flush's own delta), and calls
 * `onClick` once on release if the whole gesture stayed within TAP_MAX_MOVEMENT of its start.
 */
export function useTouchpadGesture(onMove: (dx: number, dy: number) => void, onClick: () => void): TouchpadGestureHandlers {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  const lastCumulativeDx = useRef(0);
  const lastCumulativeDy = useRef(0);
  const pendingDx = useRef(0);
  const pendingDy = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(() => {
    if (pendingDx.current === 0 && pendingDy.current === 0) return;
    onMoveRef.current(pendingDx.current, pendingDy.current);
    pendingDx.current = 0;
    pendingDy.current = 0;
  }, []);

  const stopFlushing = useCallback(() => {
    if (flushTimer.current !== null) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
  }, []);

  const onPanResponderGrant = useCallback(() => {
    lastCumulativeDx.current = 0;
    lastCumulativeDy.current = 0;
    pendingDx.current = 0;
    pendingDy.current = 0;
    stopFlushing();
    flushTimer.current = setInterval(flush, MOVE_FLUSH_INTERVAL_MS);
  }, [flush, stopFlushing]);

  const onPanResponderMove = useCallback((_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
    pendingDx.current += gesture.dx - lastCumulativeDx.current;
    pendingDy.current += gesture.dy - lastCumulativeDy.current;
    lastCumulativeDx.current = gesture.dx;
    lastCumulativeDy.current = gesture.dy;
  }, []);

  const endGesture = useCallback(
    (gesture: PanResponderGestureState) => {
      stopFlushing();
      flush(); // send any movement accumulated since the last timed flush, so the cursor lands exactly where the finger did
      if (isTouchpadTap(gesture.dx, gesture.dy)) onClickRef.current();
    },
    [flush, stopFlushing]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant,
      onPanResponderMove,
      onPanResponderRelease: (_event, gesture) => endGesture(gesture),
      onPanResponderTerminate: (_event, gesture) => endGesture(gesture),
    })
  ).current;

  return panResponder.panHandlers as TouchpadGestureHandlers;
}
