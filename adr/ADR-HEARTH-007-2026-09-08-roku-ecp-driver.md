# ADR-HEARTH-007: Roku ECP driver — first streaming-device category, real inputSelection

**Date:** 2026-09-08
**Status:** Accepted

## Context

Moving into the brief's "streaming device" category (Phase 2/4 depending on
which phase list — see `ROADMAP.md`) while the three TV drivers await
Sean's real-hardware validation. Sean confirmed he owns a Roku. Roku's
External Control Protocol (ECP) is officially documented by Roku itself
(https://developer.roku.com/docs/developer-program/debugging/external-control-api.md),
unlike the reverse-engineered Samsung/LG protocols — and applies to both
Roku streaming devices and Roku TVs, since they share ECP.

## Decision

`RokuEcpDriver` (`src/drivers/streaming/roku/`) talks to Roku over plain
`http://<ip>:8060` — no pairing, no auth, no TLS, unlike every TV driver so
far. Declares: `powerOff, volumeUp, volumeDown, mute, channelUp,
channelDown, directionalNavigation, select, back, home, inputSelection`.

Not declared:
- **`power`/`powerOn`** — Roku's documented key list has `PowerOff` but no
  power-on key.
- **`setVolume`** — volume keys are relative (`VolumeUp`/`VolumeDown`)
  only, no absolute-value command.
- **`menu`** — no confirmed menu/options key in Roku's documented list
  (the physical remote's `*` button's ECP key name wasn't found in the
  fetched docs; not guessed).

`inputSelection` **is** included here, unlike Sony/Samsung/LG, because ECP
documents real, specific keys for it (`InputTuner`, `InputHDMI1`–`4`,
`InputAV1`) — this isn't a gap like the TV drivers have.

Power state and device model are read back for real via `GET
/query/device-info` (documented `<power-mode>`/`<model-name>` XML fields).
Volume/mute/channel/nav have no query API, so those stay optimistic
(mute is tracked as a local toggle flag, matching that `VolumeMute` is
itself a toggle key, not a set-to-value key).

`UniversalTvRemote` is reused as-is for Roku devices rather than creating a
new `UniversalStreamingRemote` component — it already renders purely from
`device.capabilities` with no category-specific logic, so a second
component would be near-duplicate code for zero behavioral gain right now.

## Rationale

Same "declare only what's verified and implemented" discipline as
ADR-HEARTH-004/005/006. Roku's officially-documented API meant much less
uncertainty than the TV drivers — no self-signed-certificate problem, no
inferred field names, no separate pointer-socket mechanism — which is
itself a useful data point: this driver is the first one likely to work
against real hardware exactly as written, precedent permitting.

## Consequences

- `scripts/test-roku-connection.js` exists for a quick pre-UI hardware
  check, same pattern as the TV drivers, even though this protocol is
  simple enough that failure is more likely to mean "Control by mobile
  apps" is disabled in Settings than a protocol-level gap.
- The `UniversalTvRemote` component name is now slightly misleading (it
  renders TV *and* streaming-device remotes). Not renaming it now — no
  behavioral difference yet, and renaming purely for naming hygiene mid-task
  isn't warranted by the project's "avoid unrelated refactors" rule. Revisit
  when a category with genuinely different UI needs (e.g. lighting sliders)
  makes the shared component's shape actually strain.
- The menu-key gap should be revisited if/when Roku's ECP docs (or a future
  community reference) confirm the `*`/Options key's actual ECP name.
