# ADR-HEARTH-129: Household-shared device list through Family Command Center

**Date:** 2026-09-24
**Status:** Accepted, implemented; not yet exercised on a second real phone

## Context

Sean: "mirror leahs devices to mine with the same access." Hearth stores each phone's device list
(and pairing credentials) only on that phone, so Leah's fresh install had none.

## Question asked (ADR-GLOBAL-002)

Direction was ambiguous ("Leah's to mine" while her phone is empty). Sean chose:
**Sean's devices to Leah** (one-way, from the phone that already has everything).

## Decision

- Family Command Center gets `GET`/`PUT /api/integrations/hearth/device-sync`, behind the existing
  bearer token and rate limit, storing one snapshot in a 0600 file outside the repo
  (`~/.hearth-device-sync.json`, override with `HEARTH_DEVICE_SYNC_FILE`). See FCC adr/0184.
- Hearth's Family Command Center settings screen gets "Share mine" (publish this phone's devices)
  and "Load shared" (add devices this phone lacks). Import matches by id or hardware address and
  never overwrites a local device, so a local rename is safe.
- Modular pieces: `familyCommandCenterDeviceSync.ts` (network), `selectDevicesToImport.ts` (pure,
  tested), `DeviceSharePanel.tsx` (UI). Imported devices go through `onDeviceAdded`, so registry,
  state bridge, and persistence behave exactly as for a normally added device.

## Consequences

- The snapshot holds pairing credentials (LG clientKey, Samsung token, Sony psk). Acceptable
  because the same bearer token already grants full control of every device through the relay.
- "Same access" is by copying pairing keys. LG/Samsung TVs may show a fresh pairing prompt if they
  bind keys per client; that is a device behavior, not something this can avoid.
- Leah must enter the Family Command Center address and token once before Load works.
- Sharing is manual and one-way per press; it is not continuous two-way sync.
