# ADR-HEARTH-130: "Bump" two phones together to swap device lists

**Date:** 2026-09-24
**Status:** Accepted, implemented; matching verified live on the Pi, motion trigger not yet on a real phone

## Context

Sean: "add functionality for 'bump' ability for a person to 'bump' their phone and transfer the
devices." Builds on ADR-HEARTH-129's Share/Load buttons.

## Decision

- Pairing without a new protocol: both phones POST their device list to Family Command Center
  (`/api/integrations/hearth/bump`, adr/0185). A bump from a different phone inside a 4-second window
  matches; each phone receives the other's list (symmetric swap, so it also works when both have
  devices). Each phone merges with `selectDevicesToImport` (never overwrites, dedupes by id/hwaddr).
- Two triggers: an on-screen **Bump** button (works on the app build Sean and Leah already have) and
  a real accelerometer spike (`expo-sensors`, `bumpDetector.ts`: >2.5g, 2s cooldown).
- **Decision under uncertainty:** `expo-sensors` is a native module and the installed 1.1.0 binary
  does not contain it, so a motion trigger would otherwise force a rebuild and reinstall on both
  phones (Leah's install was hard). The sensor is loaded lazily inside try/catch, so this ships over
  the air now with the button as the trigger, and physical bumping switches on automatically at the
  next native build. Not asked of Sean given the urgency; reversible by removing the dependency.

## Consequences

- Until the next native build, "bump" means pressing Bump on both phones within a few seconds.
- Both phones must already have the Family Command Center address and token saved.
- Same trust level as ADR-HEARTH-129: the payload carries pairing credentials, gated by the bearer
  token and rate limit.
- The matcher is one in-memory slot on a single Pi; concurrent bumps by three phones would pair the
  first two only.
