import { useCallback, useEffect, useRef, useState } from "react";
import { DpadSeekDirection, TAP_STREAK_WINDOW_MS, TapStreakTracker } from "./tapStreak";

export interface DpadSeekMultiplier {
  /** The current fast-tap multiplier to show near the d-pad (e.g. 2, 5, 10, 20), or null while
   * there's no active streak — either no taps yet, or the window elapsed with no further
   * same-direction tap (ADR-HEARTH-204). Never shown for a streak still at "normal" speed. */
  multiplier: number | null;
  /** Call on every left/right d-pad tap, right after sending the real directionalNavigation
   * command — this only updates the on-screen label, never what gets transmitted. */
  registerTap: (direction: DpadSeekDirection) => void;
}

/**
 * React wiring around TapStreakTracker (the framework-free, fully unit-tested streak/escalation
 * engine in tapStreak.ts) — this hook owns only the fade-out timeout that clears the label once
 * the streak's own window elapses with no further tap, and this component's re-render. One
 * tracker is shared between the left and right d-pad buttons (TapStreakTracker itself resets the
 * streak when the tapped direction changes), matching "same direction" being tracked, not two
 * independent counters.
 */
export function useDpadSeekMultiplier(): DpadSeekMultiplier {
  const [multiplier, setMultiplier] = useState<number | null>(null);
  const trackerRef = useRef<TapStreakTracker | null>(null);
  if (trackerRef.current === null) trackerRef.current = new TapStreakTracker();
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFadeTimer = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const registerTap = useCallback(
    (direction: DpadSeekDirection) => {
      const { multiplier: next } = trackerRef.current!.recordTap(direction);
      clearFadeTimer();
      // Tap 1 of a fresh streak (or a wrap back to "normal") shows no label at all — only an
      // actual escalation (2x/5x/10x/20x) is worth surfacing (ADR-HEARTH-204).
      setMultiplier(next > 1 ? next : null);
      fadeTimerRef.current = setTimeout(() => setMultiplier(null), TAP_STREAK_WINDOW_MS);
    },
    [clearFadeTimer]
  );

  useEffect(() => clearFadeTimer, [clearFadeTimer]);

  return { multiplier, registerTap };
}
