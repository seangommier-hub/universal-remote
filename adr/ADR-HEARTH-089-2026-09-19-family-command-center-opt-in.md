# ADR-HEARTH-089: Family Command Center made visibly opt-in, not the default path

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Sean: "connecting to command center should be an opt in not mandatory." A dedicated investigation
(read the actual code paths, not assumed) found the *architecture* was already almost entirely
optional — manual add works standalone, with zero FCC dependency, for 8 of 9 brands (everything
except SmartThings, whose tokens genuinely live on the Family Command Center Pi by design — a real
structural exception, not a UI problem, and out of scope for this ADR). App startup, and LG/Samsung's
reconnect-after-IP-change logic, already degrade gracefully with FCC unconfigured — confirmed by
reading `familyCommandCenterConfig.ts` and `familyCommandCenterDeviceLookup.ts` directly rather than
assumed.

What was actually wrong was presentation, in two places:

1. `DiscoverDevicesScreen.tsx`'s "not configured" error state offered exactly one forward path —
   "Connect Family Command Center" — with no mention that manual add was a real, equal alternative
   available the whole time.
2. `DeviceListScreen.tsx` rendered a full-width "Discover devices on your network" tile *above* the
   "Or add a device manually" section — visually presenting Discover/FCC as the default, primary
   path rather than one option among several, even though manual add is the one that needs zero
   setup.

## Decision

- Added explicit copy to `DiscoverDevicesScreen.tsx`'s not-configured error state: "Family Command
  Center is only needed for automatic discovery and SmartThings — every other brand can be added
  manually from the home screen right now, no setup required."
- Reordered `DeviceListScreen.tsx`: manual add ("Add a device manually") now renders first; Discover
  moved below it and relabeled "Or discover devices automatically (optional)" — same tile, same
  functionality, demoted from apparent-default to genuinely-optional.

## Consequences

- No functional/architectural change — FCC was already gracefully optional everywhere except
  SmartThings. This is purely about the app no longer *implying* it's required when it isn't.
- SmartThings' real dependency on FCC (cloud tokens live on the Pi, proxied via a webhook SmartApp)
  is unchanged and correctly still communicated as a real requirement for that one integration, not
  papered over.
- Full suite (34/365) and `tsc --noEmit` stay clean — this was a copy/ordering change with no new
  logic to test.
