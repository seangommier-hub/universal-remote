// Framework-free timer engine behind useHoldRepeat.ts — same "plain class, directly unit-testable
// without the React rendering harness this project doesn't otherwise pull in" shape as
// TapStreakTracker (tapStreak.ts) / WakeBurstController.
//
// Real ask (2026-10-05, Sean, directly): navigating the LG's own Chrome browser needs continuous
// movement while a d-pad direction is held, the way a real remote's own d-pad works — today every
// button (CapabilityButton.tsx, DpadCluster.tsx) only ever fires once per tap. Without a real hold
// feature, the only way to "move" repeatedly was rapid manual tapping, which is exactly the known
// "two rapid taps before the pointer socket finishes opening" race LgWebOsClient.ts already
// documents. Sean's own read matches: "I think the number of pings causes the lg to freak out." A
// paced, timer-driven repeat is gentler than human tap-spam by construction.
//
// `onFirstPress` exists separately from `repeatAction` for exactly one reason: the d-pad's
// left/right buttons also feed tapStreak.ts's escalating seek-speed multiplier, and ADR-HEARTH-204
// is explicit — "the increase in speed should be due to multiple taps," not an auto-repeating hold
// timer. Routing every synthetic hold-repeat through the same call as a real tap would silently
// reintroduce exactly the hold-timer-driven escalation Sean rejected there. Only the genuine first
// press (onFirstPress, when the caller supplies one) touches that path; every repeat after the
// initial delay uses the plain repeatAction instead.

export const HOLD_REPEAT_INITIAL_DELAY_MS = 400; // matches CapabilityButton's own onLongPress delay -- the point a press reads as "held", not "tapped"
export const HOLD_REPEAT_INTERVAL_MS = 150; // a real remote's own d-pad repeat cadence; paced and predictable, unlike manual tap-spam

export class HoldRepeatScheduler {
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly initialDelayMs: number = HOLD_REPEAT_INITIAL_DELAY_MS,
    private readonly intervalMs: number = HOLD_REPEAT_INTERVAL_MS
  ) {}

  /** Call on press-in. Fires `onFirstPress` (or `repeatAction` itself, if no override was given)
   * immediately — a quick tap-and-release therefore fires exactly once, same as before this class
   * existed. If still held after `initialDelayMs`, `repeatAction` then fires every `intervalMs`
   * until `stop()`. */
  start(repeatAction: () => void, onFirstPress?: () => void): void {
    this.stop(); // defensive: never stack two repeat loops if start() somehow fires twice without a stop() between
    (onFirstPress ?? repeatAction)();
    this.initialTimer = setTimeout(() => {
      this.repeatTimer = setInterval(repeatAction, this.intervalMs);
    }, this.initialDelayMs);
  }

  /** Call on press-out (or unmount). Safe to call even when nothing is running. */
  stop(): void {
    if (this.initialTimer !== null) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.repeatTimer !== null) {
      clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
  }
}
