# ADR-HEARTH-206: `launchApp` allowed through the headless/remote-button runner

**Date:** 2026-10-02
**Status:** Accepted. Shipped — runner bundle rebuilt and deployed to the Pi, verified end to end
against the real living-room LG TV from the physical remote's own touchscreen.

## Context

Sean, building out the physical ESP32 remote's touchscreen (hearth-remote-hardware project): "add
some basic items like netflix, hulu, prime, and youtube." The Pi's button-map store
(`remote-button-map.ts`) turned out to already support this without any schema change — it's an
open `Record<string, ButtonTarget>`, not restricted to the app's 11 named `REMOTE_BUTTON_SLOTS` —
and the real `launchApp` capability (`args: { service: "netflix" | "hulu" | "primeVideo" |
"youtube" }`) already exists and is proven against this exact LG TV (ADR-HEARTH-078).

The blocker: a physical remote's button-event (Pi adr/0257) executes through
`getSharedRunner()` — the same shared runner `schedule-runner-client.ts` spawns for scheduled
Activities and the Home Assistant webhook — which inherits `headlessSupport.ts`'s
`HEADLESS_COMMAND_CAPABILITIES` allow-list, `["power", "powerOff"]` only (ADR-HEARTH-177). Mapping
Netflix/Hulu/Prime Video/YouTube without touching this would have produced the exact same
"acknowledges, does nothing" symptom Sean had just flagged with the grid's old Home button — the
Pi would accept and resolve the mapping, then the runner would silently skip the step.

## Decision

Added `"launchApp"` to `HEADLESS_COMMAND_CAPABILITIES`. Asked Sean first (a cross-cutting change
to a shared allow-list, not scoped to just this remote) — "try on the lg it is on right now" was
the go-ahead, with the target device (living-room LG) confirmed in the same breath.

**Known, accepted side effect**: this list is not specific to physical-remote button-events. A
scheduled Activity can now also `launchApp` unattended, not only power things off. Opening an app
is low-risk and fully reversible (unlike most of what this list still excludes — volume levels,
navigation, anything state-changing in a less obviously-reversible way), so this is judged
acceptable. A button press was never really "unattended" the way a 3am schedule is — someone is
standing at the remote — but it reuses this exact list rather than a second execution path
(ADR-HEARTH-177's own reasoning: the warning a person sees in the editor must be exactly what the
Pi will do). Whether button-event execution *should* keep sharing the scheduled-activity allow-list
long-term, given that mismatch in what "headless" actually means for each case, is a real open
question — not resolved here, flagged for a future ADR if it becomes a real constraint.

## Consequences

- `src/core/activities/headlessSupport.ts`: `HEADLESS_COMMAND_CAPABILITIES` now
  `["powerOff", "power", "launchApp"]`.
- `headlessSupport.test.ts`: fixed one test that asserted a Roku `launchApp` step was blocked
  (no longer true), added a dedicated test covering both the new allowed case and the
  still-blocked case (`launchApp` on a driver not in `HEADLESS_DRIVER_IDS`).
- `runner/shims/reactNative.ts`: separately had to add a no-op `AppState`/`AppStateStatus` shim to
  even get `runner/build.mjs`'s esbuild bundle building again — `haInstanceHub.ts` (added to the
  app since this bundle was last built 2026-09-26) imports `AppState`, which the shim didn't
  provide. No real foreground/background lifecycle exists in a headless Node process that only
  ever runs one short on-demand burst (`schedule-runner-client.ts`'s `RUNNER_IDLE_STOP_MS`), so a
  no-op listener is correct, not a stopgap.
- Runner bundle rebuilt (`node runner/build.mjs`) and deployed to the Pi
  (`~/hearth-runner/hearth-runner.cjs`), previous bundle kept as
  `hearth-runner.cjs.bak-2026-10-02`.
- `~/.hearth-remote-button-map.json` on the Pi: this remote (`f43c8cf1-...`, "Hearth Touch
  Remote") now maps `netflix`/`hulu`/`primeVideo`/`youtube` to the living-room LG
  (`fcc-F8:B9:5A:43:7E:3E`) via `launchApp`. Written directly to the store file (atomic
  temp-file-then-rename, matching `writeJsonFileAtomic`'s own pattern) rather than through the
  owner-authed HTTP route, since this session has direct Pi filesystem access but no real owner
  session/phone-bearer credential to use honestly.
- Verified live: a synthetic tap on the remote's own touchscreen (the existing `tap x y` debug
  tool, hearth-remote-hardware's ADR-007) on the Netflix row fired `onRowPressed` ->
  `hearthPostButtonEvent` -> the real button-event route -> the real shared runner ->
  `LgWebOsDriver.launchApp`, and the living-room LG switched to Netflix. `ButtonEventResult::Ok`
  (0), not inferred from the TV alone.

## Related

Surfaced two more real bugs while verifying this, both fixed the same session in
hearth-remote-hardware (see that project's own ADR-007/009 revisions, not duplicated here):
the firmware's boot-time mapping fetch raced Wi-Fi and always lost (every prior "nothing mapped"
screen was partly this, not only an empty map), and `mapped_list_ui.cpp` was reusing the
touchscreen grid's own (now 1-slot) `BUTTON_GRID_CELLS` as its unrelated row-buffer cap, silently
truncating the list to 1 row even with 4 real entries behind it.
