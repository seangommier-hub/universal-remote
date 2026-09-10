# ADR-HEARTH-029: Sony's input list, read live like LG's

**Date:** 2026-09-10
**Status:** Accepted

## Context

Continuing "think about all the things on the remote" past LG
(ADR-HEARTH-027) and Samsung (ADR-HEARTH-028): Sony's `inputSelection`
already worked, but the UI's `["hdmi1", "hdmi2", "hdmi3"]` list was
always a guess — correct only for a TV with exactly three plain HDMI
inputs and no component/composite/other input, and blind to how a real
TV numbers or labels its ports.

Sony's REST API has a real, documented method for this:
`avContent/getCurrentExternalInputsStatus`, paired with the already-
implemented `setPlayContent` (`{ uri: "extInput:hdmi?port=2" }` — a
confirmed real example, not guessed). Couldn't pin the exact response
field name for each input's display name to one authoritative source —
Sony's own API reference is JS-rendered and didn't yield a schema via
fetch — so the implementation checks both `title` and `label` rather
than assuming one, same honesty caveat as LG's `id`/`appId` uncertainty
in ADR-HEARTH-027.

## Decision

- `SonyBraviaDriver.refreshInputList()` — new, called once after every
  `refreshState()` inside `doConnect()`. Best-effort: a TV that rejects
  the call, or returns nothing parseable, just leaves the UI on its
  existing static `hdmi1`/`hdmi2`/`hdmi3` fallback rather than failing
  connect() or leaving the Input card empty.
- `applyCommand`'s `inputSelection` case now calls a new
  `resolveInputUri()` instead of `parseHdmiInput()` directly: a legacy
  `"hdmi1"`-style shorthand (the static fallback list) is still parsed
  the old way; a value that's already a real uri (from the dynamic list)
  passes through unchanged.
- **Real bug found and fixed while building this**: `refreshState()`
  built `values` from scratch on every call instead of merging with what
  was already there. Harmless while the only fields were power/volume/
  muted (all refreshed there anyway) — but `executeCommand()` calls
  `refreshState()` after *every* command, and `inputs` isn't one of the
  fields `refreshState()` itself manages. Without merging, pressing
  something as ordinary as volume up would have silently wiped the input
  list back out of state moments after `refreshInputList()` populated it.
  Fixed by spreading `current?.values` first.
- `UniversalTvRemote.tsx` needed no changes — the `dynamicInputs` logic
  added for LG already reads `state.values.inputs` generically, with no
  driver-specific branching, so Sony's real list is picked up by the same
  code path automatically.

## Rationale

Same reasoning as ADR-HEARTH-027: a "universal" remote screen shouldn't
carry per-manufacturer knowledge, so exposing real inputs as
driver-reported data rather than hardcoding them a second time (this
time for Sony specifically) keeps that property intact — one generic
rendering path already serves both drivers.

## Consequences

- 115/115 tests passing (4 new: input list populated on connect, a
  command executed afterward *not* wiping it back out — the regression
  test for the bug found above — and `inputSelection` handling both the
  legacy shorthand and a real uri correctly), `tsc --noEmit` clean.
- Not yet verified against a real Sony TV — same field-name uncertainty
  caveat as LG's equivalent feature, and Sean's testing this session has
  been LG-only.
