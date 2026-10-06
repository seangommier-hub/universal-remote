# ADR-HEARTH-213: a manual "Call Command Center" button on every TV's remote screen

## Status

Accepted

## Context

Sean, directly (2026-10-06): "there needs to be a button in the hearth app on all of the tvs it
can be called from."

Hearth already has a "Retry" button for Family Command Center on `OfflineAlertBanner.tsx` — but it
only appears once Hearth's own background detection (`getFccOutageMs`, `fccOutage.ts`) has already
decided there's an outage, which requires failures to span a 60-second grace period first. Today
alone showed that detection lagging or being outright wrong more than once: the Pi dropped off
WiFi multiple times with no immediately-visible signal, and `ADR-HEARTH-210`'s own relay-status bug
was exactly this class of problem (the app confidently claiming a relay was reachable when it
wasn't). Sean wants a way to check *right now*, from wherever he actually is in the app (a TV's
remote screen, not just the Devices tab), independent of whatever Hearth's own detection currently
believes.

## Decision

`checkFccReachableNow()` (new, `familyCommandCenterHealth.ts`) runs the same health probe as the
existing background `probeFccHealth()`, but returns whether *this* attempt reached Family Command
Center, rather than discarding the result for the debounced outage signal. `probeFccHealth()` is
now a thin wrapper around it, unchanged in behavior.

`useCallCommandCenterButton()` (new hook, `useCallCommandCenterButton.ts`) owns a small
idle → checking → (reached | unreachable) → idle state machine around it, auto-resetting the result
display after 3 seconds. A check already in flight is never stacked.

`UtilityActionsRow.tsx` renders this as an always-visible utility action — unconditional, not
gated on the device's own capabilities like every other button in that row, since this calls
Family Command Center itself, not the TV. Never disabled by the screen's own `controlsDisabled`
(which reflects the TV's connection, not FCC's) — the entire point is to work when nothing else on
the screen does. `deriveRemoteViewState.ts`'s `utilityButtonCount` (which drives the row's column
layout, ADR-HEARTH-134) counts it unconditionally too, so the existing wrap-to-a-second-row
behavior (already designed for an 8th+ item, per that file's own comment) keeps the layout correct
on Samsung's 7-capability worst case.

## Consequences

- Tapping "Call Center" on any TV's remote screen now checks Family Command Center right then and
  shows the real result ("Reached" / "No Answer") for 3 seconds, independent of the Devices tab's
  own outage banner.
- `checkFccReachableNow()`'s own success still feeds the existing outage-tracking side effects
  (`recordFccReached`, and after ADR-HEARTH-210, `recordRouteSuccess`) exactly as `probeFccHealth()`
  always did, so a manual check also helps clear a stale outage/relay-reachable signal faster, not
  just report one.
- New test coverage: `familyCommandCenterHealth.test.ts` (5 tests — reached, unreachable, not
  configured, immediate single-failure reporting unlike the debounced signal, probeFccHealth never
  throws/never returns a value). Full project suite: 2336/2354 passing (18 pre-existing skips, 0
  failures).
- Needs an EAS update to reach Sean's and Leah's phones before it's usable.
