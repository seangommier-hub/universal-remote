# ADR-HEARTH-204: D-pad left/right fast-tap-streak seek multiplier

**Date:** 2026-10-01
**Status:** Accepted, implemented

## Context

Sean's bug report (2026-10-01, verbatim): "can you add the multiple when rewinding or
fastworwarding videos (e.g., 2x, 5x, 10, 20x) also just look at the functionality there and verify
it works the way it should. right now holding it down doesn't continue."

### What the initial investigation found, and why it was the wrong target

The first pass audited every driver for a real rewind/fastForward protocol primitive (LG SSAP
`ssap://media.controls/rewind|fastForward` — already implemented and tested; Roku ECP `Rev`/`Fwd`;
Sony IRCC `Rewind`/`Forward` codes, corroborated against the same two sources
`SonyIrccClient.ts` already cites; Samsung Tizen `KEY_REWIND`/`KEY_FF`; Android TV/Google TV
`MEDIA_REWIND`/`MEDIA_FAST_FORWARD` from androidtvremote2's own `TvKeys.txt`; Apple TV's pyatv
`skip_backward`/`skip_forward`), and began designing a press-and-hold-repeat mechanism for
dedicated new rewind/fastForward buttons.

Sean corrected this mid-task, twice, down to the actual request:

1. **No new buttons, no `rewind`/`fastForward` wiring.** Hearth's existing d-pad **left/right**
   (`directionalNavigation`) is what a real Roku/Apple TV/Android TV remote already uses for
   scrubbing — holding left/right while something plays is what makes the streaming app's *own*
   on-screen UI show its 2x/5x/10x/20x scrub multiplier. The remote never sends a distinct
   "fast-forward" signal; it just repeats the same directional button, and the app interprets
   sustained input as acceleration. `directionalNavigation` is also declared by nearly every
   driver (LG, Samsung, Sony, Roku, Android TV, Apple TV, Home Assistant `remote` entities), far
   more universally than `rewind`/`fastForward`, which only LG has.
2. **Not a hold-timer auto-repeat, either.** Sean, directly: "the increase in speed should be due
   to multiple taps," not a sustained hold with an internal auto-fire interval. Every tap must
   still send exactly one real `directionalNavigation` command — never more commands than the
   person actually tapped.
3. **The escalation is a fast-tap-streak counter, not a duration-based tier.** Consecutive taps on
   the *same* direction within a short window of each other escalate a purely client-side,
   on-screen multiplier label: 1st tap = normal (no label), 2nd quick tap = 2x, 3rd = 5x, 4th =
   10x, 5th = 20x. A 6th rapid tap wraps back to normal (Sean: "after the 20x it goes back to
   normal play speed") and the cycle repeats. A tap that arrives after the window has elapsed
   (the user paused) resets to normal, not back one step.
4. Applies to **left/right only** — up/down have no seek/scrub meaning on a d-pad.
5. Applies to **any device with `directionalNavigation`**, not gated on which brands happen to
   have a real `rewind`/`fastForward` primitive — this is a purely client-side tap-cadence
   feature, nothing protocol-specific.

The rewind/fastForward protocol audit above is left as a correct, already-implemented (LG) /
not-pursued-further (every other brand) record, but it is **not** the mechanism this feature uses
and was not wired onto any additional driver.

## Decision

- **`src/ui/tapStreak.ts`** (framework-free, like `WakeBurstController`/`startConnectionHeartbeat`
  — no React, directly unit-testable without this project's otherwise-absent React rendering
  harness): `TAP_STREAK_WINDOW_MS = 650` (named constant, picked from the middle of Sean's given
  "~600-700ms" range — not precision-critical). `TAP_STREAK_MULTIPLIERS = [1, 2, 5, 10, 20]`.
  `multiplierForTapCount(tapCount)` is a pure lookup that **cycles** via `% length` rather than
  capping, so tap 6 wraps back to tier 0 ("normal"). `TapStreakTracker` holds one streak
  (direction, last-tap timestamp, tap count) — `recordTap(direction)` continues the streak only
  when the direction matches and the gap is within the window; otherwise it restarts at tap 1.
- **`src/ui/useDpadSeekMultiplier.ts`**: thin React wrapper — owns a `TapStreakTracker` instance
  (one, shared between the left and right buttons; the tracker itself resets on a direction
  change, so "same direction" is enforced in one place) and a fade-out `setTimeout` that clears the
  on-screen multiplier if no further same-direction tap arrives within the window, matching "it
  reflects a currently-active fast-tap streak," not persistent state. A multiplier of exactly 1
  (normal) is represented as `null` — the label never shows for a plain, un-escalated tap.
- **`src/ui/UniversalTvRemote.tsx`**: the existing Left/Right `CapabilityButton`s' `onPress` now
  call a new `pressDpadSeekDirection(direction)`, which sends the *exact same* one
  `directionalNavigation` command as before and then feeds the tap to
  `useDpadSeekMultiplier().registerTap`. Up/Down are untouched. A small pill
  (`"Seeking {multiplier}x"`) renders inside `hubCard`, `position: "absolute"` (so it adds **zero**
  layout height whether shown or not — satisfies "do not increase the remote page's height")
  anchored near the top of the card, inside `hubCard`'s own `overflow: "hidden"` bounds (a
  negative offset that escaped the card would get clipped). Gated implicitly by `hasDpad` already
  wrapping this whole block — no separate capability check needed, since there is nothing to tap
  without a d-pad.
- **Label wording — "Seeking Nx", not "Fast-forwarding Nx" or similar.** Per Sean's own framing:
  this is Hearth being honest about its own tap cadence (how fast *it* is sending repeated
  directional taps), never a claim about what the TV/streaming app's own on-screen overlay is
  doing — Hearth has no way to see that overlay at all.
- **Activity log:** `directionalNavigation` is already in `commandVerb.ts`'s `NAVIGATION_NOISE`
  set, so a fast tap streak (now potentially many presses in under a second) does not spam the
  household activity log — this was already true before this change and needed no update.
- **`holdCenterPlayPause`** (the existing single-fire press-and-hold on the merged LG
  select/play/pause center button) was re-confirmed unaffected: it's a wholly separate code path
  (`CapabilityButton`'s existing `onLongPress`, not touched by this change at all), still fires
  exactly once per hold, alternating play/pause — verified by re-reading `LG_CAPABILITIES`'
  existing test coverage, which this change didn't touch.

## What was explicitly not built

- No new `rewind`/`fastForward` capability wiring on Roku, Sony, Samsung, Android TV, or Apple TV
  (the real primitives found during the initial audit — see Context above — remain unused by this
  feature; LG's pre-existing `rewind`/`fastForward` implementation and tests are untouched, not
  removed).
- No hold-to-repeat timer/interval mechanism anywhere — rejected mid-task in favor of the tap-
  cadence counter above. No auto-fire of extra commands beyond what the person actually tapped.

## Consequences

- `src/ui/tapStreak.ts` + `src/ui/tapStreak.test.ts` (10 tests: tier lookup boundaries, the
  wrap-after-20x cycle, same-direction escalation, direction-change reset, window-boundary
  inclusion/exclusion) and `src/ui/useDpadSeekMultiplier.ts` (thin, untested-by-this-project's-own-
  convention React glue, matching `useKeepScreenAwake.ts`/`useSwipeBackGesture.ts`'s existing
  split between a tested pure engine and untested hook wiring).
- `src/ui/UniversalTvRemote.tsx`: new `pressDpadSeekDirection` helper, Left/Right `onPress` updated,
  one new absolutely-positioned overlay + three new styles. No existing capability gating, sizing,
  or Up/Down behavior changed.
- `npx tsc --noEmit` and `npx jest` (194 suites, 2279 tests) both clean after this change.
- Verified in the web harness (`scripts/ui-verify/run.mjs`, `remote-lg` scenario family) by holding
  a rapid tap sequence on the LG remote's Left button: the "Seeking Nx" label appears and escalates,
  and the remote page's no-vertical-scroll assertion (`assertFit: true` scenarios) still passes —
  confirming no height regression.
