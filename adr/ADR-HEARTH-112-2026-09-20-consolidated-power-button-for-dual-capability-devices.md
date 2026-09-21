# ADR-HEARTH-112: Consolidated power button for devices with both powerOn and powerOff

**Date:** 2026-09-20
**Status:** Accepted, implemented

## Context

Sean, live on his own LG TV, directly: "it is showing two power buttons in the app and it
shouldn't." `UniversalTvRemote.tsx` renders one button per declared capability with no
consolidation logic — that was fine as long as every driver declared at most one of
`power`/`powerOn`/`powerOff`. `LgWebOsDriver` (ADR-HEARTH-102, this same session) is the first
driver to declare both `powerOn` (Wake-on-LAN) and `powerOff` (SSAP) as separate capabilities, so
the screen dutifully rendered two separate power buttons side by side — the first real device to
expose this rendering gap.

## Decision

Added `hasSeparatePowerOnOff = has(device, "powerOn") && has(device, "powerOff")` in
[UniversalTvRemote.tsx](../src/ui/UniversalTvRemote.tsx). When true, render a single toggle-feeling
button instead of two: icon and `variant` reflect `knownPower` (accent/filled when on, ghost when
off/unknown), and `onPress` sends whichever capability is the real opposite of the last-known
state, defaulting to `powerOn` when state is unknown (matching how a real remote's single power
button behaves — you don't get asked which of two buttons is "correct" for the TV's current
state). Devices with only one of the two capabilities (Xbox/PS5: `powerOn` only; Roku: `powerOff`
only) keep their existing single-button rendering unchanged.

## Consequences

- Matches how `power`-capable devices (Sony/Samsung) already render — one physical button,
  regardless of how many capabilities the driver splits the underlying action into.
- `npx tsc --noEmit` clean. No dedicated test file exists for `UniversalTvRemote.tsx` (consistent
  with this project's existing convention — it's a pure capability-gated render layer with no
  independent logic to unit test), verified instead by re-reading the rendered JSX and by live
  device confirmation.
- Establishes the pattern for any future driver that splits power into two capabilities: gate on
  `hasSeparatePowerOnOff` rather than adding another one-off two-button case.
