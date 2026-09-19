# ADR-HEARTH-088: Kasa suggested name — extending ADR-HEARTH-085 to a second driver

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

ADR-HEARTH-085 built the "suggested name" pattern for Roku only, flagging the other drivers as a
research follow-up. A dedicated research pass (verified against real sources, not guessed)
confirmed: Kasa's `alias` field is the outlet's own real, user-set name — already fetched by
`getSysInfo()` on every `connect()` for the `model` field, so surfacing it costs nothing extra.
Verified against `python-kasa`'s legacy IOT-protocol source (`kasa/iot/iotdevice.py`), the same
protocol reference this driver already cites elsewhere.

Same research pass also confirmed: **Samsung and Sony** each have a real name field but need one
new network call apiece (not yet built, still a real follow-up); **LG** has no known field in any
of three sources checked (do not invent one); **SmartThings** already fully implements this exact
pattern (`AddSmartThingsOutletsScreen.tsx` already sets `device.name = outlet.label`) — nothing
further needed there.

## Decision

`KasaPlugDriver.ts`'s `connect()` now includes `deviceName: info.alias` in its state patch,
mirroring Roku's exact shape — `DiscoverDevicesScreen.tsx`'s generic
`stateStore.get(device.id).values.deviceName` read (already built for Roku) picks this up
automatically, no UI changes needed for this driver specifically.

## Consequences

- Kasa outlets discovered via the Discover flow get a real suggested name (e.g. "Christmas
  Lights") instead of a DHCP hostname, same benefit Roku already has.
- `AddKasaDeviceScreen.tsx` (the dedicated manual-add screen, distinct from Discover) still asks
  the user to type a name directly and isn't wired to this — that screen already solves the naming
  problem via direct input, so pre-filling it wasn't treated as part of this scope.
- Samsung and Sony remain open follow-ups (each needs a new, cheap network call); LG remains
  correctly unaddressed pending a real source.
