# ADR-HEARTH-060: Move the "Sling TV" input filter from one screen's render into the driver

Date: 2026-09-12

## Status

Accepted.

## Context

Earlier tonight, honoring Sean's repeated, direct request to remove "Sling TV" from his LG TV's
input list, the filter was added inside `UniversalTvRemote.tsx`'s own render logic — filtering the
`dynamicInputs` value derived from `state.values.inputs` just for that one screen's display.

While live-verifying [[ADR-HEARTH-059]] (Scenes' new input-selection support) against the real TV,
"Sling TV" reappeared in `CreateSceneScreen`'s "Switch input to:" chip row — a second, independent
consumer of the exact same `state.values.inputs` data, which reads it directly from `StateStore`
rather than through `UniversalTvRemote.tsx`'s local derived variable. The original fix only ever
touched one screen's rendering, not the shared data itself, so any other consumer of that state was
always going to see the raw, unfiltered list.

## Decision

Moved the filter into `LgWebOsDriver.refreshInputList()` — the one place `state.values.inputs` is
actually produced — so it's applied once, at the source, for every current and future consumer.
Removed the now-redundant filter from `UniversalTvRemote.tsx`, which goes back to a plain type-guard
`.filter()` with no Sling-TV-specific logic of its own.

## Consequences

- Every screen that reads a device's live input list (the remote screen's Input card, the Scenes
  input picker, any future consumer) now agrees — "Sling TV" is gone from the underlying state
  itself, not hidden per-screen.
- Added a real unit test (`LgWebOsDriver.test.ts`) asserting the filter at the driver level directly,
  rather than relying only on downstream UI checks.
- Live-verified: reloaded the app against the real LG TV and confirmed "Sling TV" no longer appears
  in the Scenes input picker (previously reproduced live, now fixed and re-checked).
- All 259 tests pass (up from 257 — one new driver-level test plus one from [[ADR-HEARTH-059]]);
  typecheck clean.

## Related

[[ADR-HEARTH-059]], the original UniversalTvRemote.tsx-only fix (2026-09-12, same night, superseded
by this ADR)
