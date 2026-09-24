# ADR-HEARTH-131: Automatic device mirroring between household phones, and the 1.2.0 native build

**Date:** 2026-09-24
**Status:** Accepted, implemented

## Context

Sean, with both phones plugged into the PC: "add any updates and also make her phone mirror mine
for hearth." Manual Share/Load (ADR-HEARTH-129) and Bump (ADR-HEARTH-130) both need taps on each
phone; a phone's device list cannot be read over USB (ad hoc app, iOS sandbox), so the mirror had to
be something the app does itself.

## Decision

1. `runAutoDeviceSync` runs at startup and on every return to the foreground: it adds shared devices
   this phone lacks, then publishes the union so other phones get anything only this one had.
   Additive only, converging all phones with no taps; an empty phone never wipes the shared list;
   it does nothing (silently) if Family Command Center isn't saved or reachable.
   Downside accepted: a device removed on one phone can come back from another.
2. Native build **1.2.0** (`expo-sensors` added, ADR-HEARTH-130) so physical bumping works, installed
   over USB on both phones. Version bumped per ADR-HEARTH-106 so 1.1.0 binaries and 1.2.0 OTA
   updates don't cross.

## Consequences

- Leah's phone mirrors Sean's once she saves the Family Command Center address and token; from then
  on both stay converged. Credentials are shared automatically, same trust level as ADR-HEARTH-129.
- Phones on the 1.1.0 build stop receiving OTA updates until reinstalled with 1.2.0.
