// Client-side-only escalating multiplier for rapid repeated taps on the same d-pad direction
// (ADR-HEARTH-204). Sean, directly: "the increase in speed should be due to multiple taps," not
// an auto-repeating hold timer — every tap still sends exactly one real directionalNavigation
// command (UniversalTvRemote.tsx's own send() call is unchanged); this module only decides what
// multiplier label a fast streak of same-direction taps should show next to the d-pad. Framework-
// free (same "plain class + fake/injectable clock" shape as WakeBurstController/
// startConnectionHeartbeat) so it's directly unit-testable without the React rendering harness
// this project doesn't otherwise pull in.

/** Max gap between two same-direction taps for the second one to continue the streak rather than
 * restart it. Not precision-critical — picked from the middle of Sean's given "~600-700ms" range. */
export const TAP_STREAK_WINDOW_MS = 650;

/** Multiplier shown after 1, 2, 3, 4, 5 consecutive same-direction taps — the 1st tap is a plain
 * press (no label; see useDpadSeekMultiplier.ts), escalating through 2x/5x/10x/20x. Sean,
 * directly: "after the 20x it goes back to normal play speed" — a 6th rapid same-direction tap
 * wraps back to tap 1's "normal" (no label) rather than staying pinned at 20x, and the cycle
 * repeats from there (see multiplierForTapCount's modulo). */
export const TAP_STREAK_MULTIPLIERS = [1, 2, 5, 10, 20] as const;

export type DpadSeekDirection = "left" | "right";

/** Pure lookup — the multiplier for a streak that has reached `tapCount` consecutive taps. Cycles
 * back to TAP_STREAK_MULTIPLIERS[0] ("normal") after the last tier instead of capping there.
 * Exported for direct unit testing. */
export function multiplierForTapCount(tapCount: number): number {
  const index = (Math.max(tapCount, 1) - 1) % TAP_STREAK_MULTIPLIERS.length;
  return TAP_STREAK_MULTIPLIERS[index];
}

export interface TapStreakResult {
  /** 1 means "no escalation yet" — the caller should show no label for this tap. */
  multiplier: number;
}

/**
 * Tracks one escalating same-direction tap streak. A tap on the other direction, or one that
 * arrives after `windowMs` has passed since the last tap, restarts the streak at tap 1 rather than
 * continuing it — matching "a pause resets the level back to the start, not to the next step up."
 */
export class TapStreakTracker {
  private direction: DpadSeekDirection | null = null;
  private lastTapAtMs = 0;
  private tapCount = 0;

  constructor(
    private readonly windowMs: number = TAP_STREAK_WINDOW_MS,
    private readonly now: () => number = Date.now
  ) {}

  /** Call on every left/right d-pad tap, after sending the real command. Returns the multiplier that tap's streak has now reached. */
  recordTap(direction: DpadSeekDirection): TapStreakResult {
    const nowMs = this.now();
    const continuesStreak = this.direction === direction && nowMs - this.lastTapAtMs <= this.windowMs;
    this.tapCount = continuesStreak ? this.tapCount + 1 : 1;
    this.direction = direction;
    this.lastTapAtMs = nowMs;
    return { multiplier: multiplierForTapCount(this.tapCount) };
  }
}
