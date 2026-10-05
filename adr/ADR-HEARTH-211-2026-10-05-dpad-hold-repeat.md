# ADR-HEARTH-211: d-pad directional buttons repeat while held

## Status

Accepted

## Context

Sean, directly (2026-10-05): "the movement when chrome browser is open needs to have hold down
movement capability, meaning that if the button is held down, it moves in that direction because i
think the number of pings causes the lg to freak out."

Navigating the LG's own Chrome browser app needs continuous directional movement, the way a real
remote's d-pad works. Checked the actual current behavior first (DpadCluster.tsx, CapabilityButton.tsx):
there was no hold-repeat at all — every direction (up/down via `onSend("directionalNavigation", ...)`,
left/right via `onSeekDirection`/`pressDpadSeekDirection`) fired exactly once per tap, full stop.
The only way to "move continuously" today was rapid manual tapping.

Sean's own diagnosis of the knock-on effect matches the code: `LgWebOsClient.ts` already documents
"two rapid button presses (e.g. fast d-pad taps) before the first pointer-socket ... race that
Family Command Center traced live on this same TV." Rapid manual tap-spam is exactly the access
pattern that race needs.

Left/right needed extra care: they also feed `tapStreak.ts`'s escalating seek-speed multiplier, and
ADR-HEARTH-204 is explicit — "the increase in speed should be due to multiple taps," not an
auto-repeating hold timer. A naive hold-repeat that re-fired `onSeekDirection` on every tick would
silently reintroduce exactly the hold-timer-driven escalation Sean rejected there.

## Decision

New `HoldRepeatScheduler` (`src/ui/holdRepeatScheduler.ts`) — a framework-free class, same "plain
class, directly unit-testable without the React rendering harness this project doesn't otherwise
pull in" shape as `TapStreakTracker`. `start(repeatAction, onFirstPress?)` fires `onFirstPress` (or
`repeatAction` itself, with no override) once immediately, then `repeatAction` every
`HOLD_REPEAT_INTERVAL_MS` (150ms) once still held past `HOLD_REPEAT_INITIAL_DELAY_MS` (400ms,
matching `CapabilityButton`'s existing long-press delay). `stop()` tears both timers down.

`useHoldRepeat.ts` is a thin React hook wrapping one scheduler instance per call site.
`CapabilityButton.tsx` grew optional `onPressIn`/`onPressOut` passthrough props, merged with (never
replacing) its existing always-on haptic. `DpadCluster.tsx` wires all four directions:

- **Up/down**: `useHoldRepeat(() => onSend("directionalNavigation", {direction}))` — a single
  action, no change in what a plain tap does.
- **Left/right**: `useHoldRepeat(plainSend, onFirstPress: () => onSeekDirection(direction))` — the
  genuine first press still goes through the existing `onSeekDirection` path exactly as before
  (real command + tap-streak registration), so a plain tap's behavior is byte-for-byte unchanged.
  Only a held repeat past the initial delay falls back to the plain command, deliberately bypassing
  the streak tracker — preserving ADR-HEARTH-204 exactly.

Each directional button's own `onPress` became a no-op; firing now happens entirely through
`onPressIn` (immediate) and the repeat timer, matching `CapabilityButton`'s own stated design
philosophy ("fired the instant a press begins... reads as a physical button's own immediate click").

## Consequences

- Holding a d-pad direction now moves continuously, paced at a fixed 150ms interval instead of
  however fast a person can physically tap — gentler on the LG's pointer socket by construction,
  not just incidentally.
- A plain tap (press and release before 400ms) behaves exactly as before on every direction,
  including left/right's seek-multiplier badge — verified in `holdRepeatScheduler.test.ts`.
- New, framework-free test coverage (6 tests): single-tap-fires-once, held-repeats-on-interval,
  onFirstPress-vs-repeatAction separation, stop()-is-safe-before-start(), no-double-stacking on a
  stray repeated start(), custom timing. No React rendering harness needed, matching project
  convention.
- Not yet verified against the real LG TV — logic-level fix, needs a real hold-and-navigate test in
  the TV's Chrome browser before calling the underlying "freak out" theory confirmed, not just
  plausible.
- Needs an EAS update to reach Sean's and Leah's phones before it's usable at all.
