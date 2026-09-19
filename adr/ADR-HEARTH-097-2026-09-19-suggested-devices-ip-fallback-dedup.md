# ADR-HEARTH-097: "Suggested From Your Network" dedup fails for manually-added devices

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Real-hardware bug found live: Sean paired his LG TV (192.168.1.218) through the manual "Add
Device → LG webOS" screen — the only path that currently works for LG, which needs Family Command
Center's relay to connect at all (ADR-HEARTH-014, self-signed cert React Native's WebSocket can't
trust directly). After connecting successfully, the TV kept reappearing in the home screen's
"Suggested From Your Network" section (ADR-HEARTH-092/094/095) as if it had never been added.

Root cause: `DeviceListScreen.tsx`'s dedup (`knownHwaddrs`) only ever compared hardware addresses.
`handleQuickAdd` (the suggestion tile's own one-tap connect) populates `config.hwaddr` from the
discovery source — but every *manual* "Add Device" screen (`AddLgDeviceScreen.tsx`,
`AddSonyDeviceScreen.tsx`, `AddSamsungDeviceScreen.tsx`, `AddRokuDeviceScreen.tsx`,
`AddYamahaDeviceScreen.tsx`, `AddKasaDeviceScreen.tsx`, `AddXboxDeviceScreen.tsx`) only ever
stores `{ ipAddress, ... }` — none of them look up or store a hwaddr. So a device paired manually
can never match the hwaddr-only check, regardless of brand — this wasn't LG-specific, just first
surfaced there because LG is the one brand that currently forces the manual-entry path.

## Decision

Added an IP-address fallback alongside the existing hwaddr check in the same filter
(`DeviceListScreen.tsx`'s `suggested`-scan effect): a discovered device is also excluded from
Suggested if its IP matches any already-paired device's `config.ipAddress`. IP is a weaker
identity than a hwaddr (it can change if a device gets a new DHCP lease), but it's what every
manual-add screen actually records today, so it's a real fix for the bug in hand rather than a
guess — and it's additive, not a replacement: the hwaddr check (still the stronger match when
available, e.g. from `handleQuickAdd`) runs first.

## Consequences

- Any device added through a manual "Add Device" screen — not just LG — now correctly drops out
  of "Suggested From Your Network" once paired, instead of reappearing indefinitely.
- Does not fix the underlying gap that manual-add screens never capture a hwaddr at all (a device
  that later changes IP would need to be dealt with the same way ADR-HEARTH-085's rename/dedup
  work already handles stale IPs elsewhere) — that's a separate, deliberately deferred
  improvement, not required to fix the bug actually hit.
- `npx tsc --noEmit` clean. No existing test file for `DeviceListScreen.tsx` (a UI wiring
  component, consistent with this project's established precedent of live-verifying picker/list
  screens like this rather than unit-testing them — see ADR-HEARTH-062).
