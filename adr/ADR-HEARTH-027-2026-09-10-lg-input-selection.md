# ADR-HEARTH-027: Real input selection for LG, read live off the TV

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean: "there also needs to be an input button on the remote. think about
all the things on the remote." He's testing an LG TV, and
`LG_CAPABILITIES` had an explicit comment already flagging this as a
known, deliberate gap: "No inputSelection — switching inputs needs
ssap://tv/getExternalInputList to learn valid inputIds first, which
isn't implemented yet." This was always the plan, just not done.

Confirmed the real SSAP mechanism against `hobbyquaker/lgtv2` (this
driver's existing reference) before implementing: `ssap://tv/getExternalInputList`
returns a `devices` array of available inputs, and `ssap://tv/switchInput`
with payload `{ inputId: "<id>" }` switches to one. Couldn't pin the exact
response field name to one authoritative source — community references
split between `devices[].id` and `devices[].appId` — so the implementation
checks both rather than assuming one.

## Decision

Unlike Roku/Sony's `inputSelection`, which is a fixed, hardcoded
`["hdmi1", "hdmi2", "hdmi3"]` button set (those protocols' own input
identifiers really are that static), LG's real inputs and labels vary per
TV and configuration and can't be known ahead of time. So:

- `LgWebOsDriver` gains a `refreshInputList()` method, called once after
  every successful connect (alongside the existing `refreshVolumeState()`).
  Best-effort — a TV that rejects the call, or has none, just leaves
  `state.values.inputs` unset rather than failing the whole connect.
- `applyCommand`'s new `inputSelection` case calls
  `ssap://tv/switchInput` with whatever real id the UI passed through —
  no translation layer, since the UI is now working with real ids sourced
  from the TV itself, not synthetic ones.
- `UniversalTvRemote.tsx`'s Input card reads `state.values.inputs` when
  present and renders real buttons from it (also highlighting the
  currently-selected input); falls back to the static Roku/Sony-style
  list only when a driver hasn't provided a dynamic one.

## Rationale

Building this as driver-reported dynamic data rather than hardcoding
LG-specific input ids matches how the rest of this "universal" remote
already works — `UniversalTvRemote.tsx` has no per-manufacturer logic
anywhere else in it, and a fixed guess at LG's input ids would have been
wrong for any TV configured differently than whatever one this session's
data happened to be modeled on.

Samsung's protocol has a `KEY_SOURCE` key that opens the TV's own
on-screen source picker rather than jumping directly to a resolved input
— a different shape of capability than "list inputs, pick one directly."
Not folded into `inputSelection` here since it isn't the same mechanism;
left as a known, separate gap rather than forced into a capability it
doesn't actually match.

## Consequences

- 111/111 tests passing (3 new: input list populated on connect,
  `inputSelection` sending the real `switchInput` call, and a TV that
  rejects `getExternalInputList` still finishing connect without a
  populated list). One existing test's assertion flipped
  (`not.toContain("inputSelection")` → `toContain(...)`, since that's now
  intentionally true) and the shared `connectDriver` test helper (plus
  two other tests that manually drive the same handshake) updated to
  answer the new `getExternalInputList` request `doConnect()` now sends —
  without that, those tests would hang waiting on a response that never
  came. `tsc --noEmit` clean.
- Not yet verified against Sean's real LG TV — same outstanding caveat as
  everything else this session, but this one specifically depends on
  guessing right about the response field name (`id` vs `appId`), which
  only a real device can settle.
- Samsung's `KEY_SOURCE`-based source picker remains unimplemented —
  worth its own ADR if picked up, not assumed to be "the same as
  inputSelection" just because the name rhymes.
