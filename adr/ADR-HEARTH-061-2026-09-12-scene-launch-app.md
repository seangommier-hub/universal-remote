# ADR-HEARTH-061: Scenes can launch a streaming app

Date: 2026-09-12

## Status

Accepted.

## Context

Following the same reasoning as [[ADR-HEARTH-059]] (Scenes' inputSelection support): `launchApp`
also doesn't need a new per-capability config UI, because its valid values are already a small,
fixed, already-known set — the same 4-entry `StreamingService` type (`netflix`, `hulu`, `primeVideo`,
`youtube`) every `launchApp`-capable driver (LG, Roku — see `Capability.ts`'s own citation of which
drivers implement it) already maps to its own protocol's real app id. Unlike `inputSelection`, this
list isn't even device-specific live state — it's the same universal 4 services everywhere. Sean's
own "Movie Night" scenario is now fully real: power on the TV, switch to the right input, launch
Netflix, and mute the receiver, all in one tap.

## Decision

`CreateSceneScreen` renders a "Launch app:" chip row (labels: Netflix, Hulu, Prime Video, YouTube —
the same display names `UniversalTvRemote.tsx`'s own streaming-app tiles use, just without that
screen's brand-wordmark styling) under any device that declares `launchApp`. Selecting a service
*replaces* any previously-selected service for that device (a scene can only launch one app per
device, not several) — tapping the already-selected service again removes it, reusing the exact same
generic `toggleAction(deviceId, capability, args)` replace-logic `inputSelection` already added, with
no changes needed to that function itself. `describeAction` resolves a `launchApp` action to "Launch
Netflix" (etc.) in the scene summary, not the raw capability name.

## Consequences

- No changes needed to `Scene`, `sceneRunner.ts`, or `SceneAction` — the `args?: Record<string,
  unknown>` shape ADR-HEARTH-059 already added covers this without modification.
- A device declaring `launchApp` but no no-arg capability and no selectable inputs (none exist
  today, since every current `launchApp` driver also declares plain toggles) would still correctly
  appear in the scene builder via the updated `relevantDevices` filter — checked, not just assumed.
- All 259 tests still pass; typecheck clean. No new automated tests added for this specific chip
  row (same effort level as ADR-HEARTH-059's own `CreateSceneScreen` UI, covered by type-checking
  plus live verification) — `sceneRunner`'s handling of an action's `args` was already tested there
  and needs no further coverage for a second arg-carrying capability using the identical mechanism.

## Related

[[ADR-HEARTH-059]], [[ADR-HEARTH-056]], [[ADR-HEARTH-058]]
