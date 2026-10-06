import { useCallback, useRef } from "react";
import { HoldRepeatScheduler } from "./holdRepeatScheduler";

// Thin React wiring around HoldRepeatScheduler (the real, framework-free logic — see its own
// header comment for the full story, including why `onFirstPress` exists separately from
// `repeatAction`). This hook owns only the scheduler instance's lifetime and refs so callers don't
// need to memoize their callbacks themselves.

export interface HoldRepeatHandlers {
  onPressIn: () => void;
  onPressOut: () => void;
}

/**
 * Turns a single tap-to-fire-once action into press-and-hold-to-repeat: fires `repeatAction` (or
 * `onFirstPress`, when given — see HoldRepeatScheduler) immediately on press-in, then again on an
 * interval while still held. `onPressOut` must be wired to the same control's release (and ideally
 * its cancel) or the repeat keeps firing past the actual release.
 */
export function useHoldRepeat(repeatAction: () => void, onFirstPress?: () => void): HoldRepeatHandlers {
  const repeatActionRef = useRef(repeatAction);
  repeatActionRef.current = repeatAction;
  const onFirstPressRef = useRef(onFirstPress);
  onFirstPressRef.current = onFirstPress;
  const schedulerRef = useRef<HoldRepeatScheduler | null>(null);
  if (schedulerRef.current === null) schedulerRef.current = new HoldRepeatScheduler();

  const onPressIn = useCallback(() => {
    const onFirst = onFirstPressRef.current;
    schedulerRef.current!.start(
      () => repeatActionRef.current(),
      onFirst ? () => onFirst() : undefined
    );
  }, []);

  const onPressOut = useCallback(() => {
    schedulerRef.current!.stop();
  }, []);

  return { onPressIn, onPressOut };
}
