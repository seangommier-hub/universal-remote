# ADR-HEARTH-096: Samsung + Sony suggested name — closing out ADR-HEARTH-085/088's follow-ups

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

ADR-HEARTH-088 left Samsung and Sony as open follow-ups: each has a real, user-set device-name
field, but surfacing it needs one new network call apiece (unlike Roku/Kasa/SmartThings, where the
name was already being fetched for another reason). This ADR closes both out, verified against
primary sources rather than guessed:

- **Samsung**: a plain, unauthenticated HTTP GET to `http://<ip>:8001/api/v2/` (a separate endpoint
  from the paired `ws://<ip>:8001/api/v2/channels/samsung.remote.control` remote-control channel)
  returns `{"device": {"name": "[TV] <real name>", ...}}`. Verified against Home Assistant's
  actively-maintained `samsungtv` integration (`config_flow.py`), which reads this same endpoint
  and strips the same fixed `"[TV] "` prefix — confirmed to be a protocol artifact, not part of the
  name a user actually sets.
- **Sony**: the existing JSON-RPC `system` service already has a documented `getSystemInformation`
  method with a `name` field. Verified directly against Sony's own BRAVIA Professional Displays
  Knowledge Center (pro-bravia.sony.net) for both v1.0 and v1.7 schemas — both include `name`
  (example: `{"result": [{"generation": "5.6.0", "product": "TV", "name": "BRAVIA", ...}], "id":
  33}`). No version override needed: this client's existing default ("1.0", same as every other
  call `SonyBraviaDriver.ts` already makes) already has the field, so no new hardcoded version
  string was introduced.

## Decision

- `SamsungTizenClient.ts` gets a new `getDeviceName()` method (a plain fetch, no pairing required);
  `SamsungTizenDriver.ts`'s `doConnect()` awaits a new best-effort `refreshDeviceName()` that calls
  it and patches `state.values.deviceName` — never fails `connect()` itself, matching every other
  driver's identical best-effort treatment of this field (LG's absence, Roku's `activeApp.appName`,
  Kasa's `alias`).
- `SonyBraviaDriver.ts` gets an equivalent `refreshDeviceName()` called from `doConnect()` alongside
  the existing `refreshInputList()`, using the same `SonyBraviaClient.call()` this driver already
  uses for power/volume/input — no new client method needed since `call()` is already generic.
- Both feed the same generic `stateStore.get(device.id).values.deviceName` read in
  `DiscoverDevicesScreen.tsx` (built for Roku in ADR-HEARTH-085) — no UI changes needed for either
  driver.

## Consequences

- Samsung and Sony TVs discovered via the Discover flow now get a real suggested name (e.g. "Living
  Room Samsung") instead of a DHCP hostname, closing the gap ADR-HEARTH-088 left open.
- LG remains correctly unaddressed — no real source has been found for a comparable field across
  three checked references, and this project does not guess protocol fields.
- All 4 driver directories following this pattern (Roku, Kasa/SmartThings, Samsung, Sony) are now
  consistent; LG is the sole documented exception.
- Verified: `npx jest src/drivers/tv/samsung src/drivers/tv/sony --silent` → all passing (29 + 23
  tests); `npx jest --silent` project-wide → 395 passed, 395 total; `npx tsc --noEmit` → clean.
