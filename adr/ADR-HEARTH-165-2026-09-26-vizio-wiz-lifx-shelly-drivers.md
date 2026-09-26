# ADR-HEARTH-165: Native drivers for Vizio SmartCast, Wiz, LIFX and Shelly

**Date:** 2026-09-26
**Status:** Accepted. Implements the Vizio, Wiz and Shelly items of ADR-HEARTH-158 Tier 3 item 10, plus LIFX. Google
TV, Govee and the Home Assistant driver are separate work.

## Context
Four more brands were wanted as native drivers. Three of them cannot be spoken to from the phone:
- Vizio SmartCast is HTTPS with a self-signed certificate; React Native `fetch` cannot accept it.
- Wiz is JSON over UDP 38899 and LIFX is binary UDP 56700; the phone has no working UDP socket on iOS
  (`react-native-udp` does not support the New Architecture, see `SsdpDiscoveryProvider.ts` and ADR-HEARTH-110).
- Shelly is plain HTTP on port 80 with no pairing, so it works directly.

## Decisions
1. **Route the three unreachable protocols through Family Command Center**, the Kasa pattern (`KasaClient.ts`), using
   `fccJsonRequest`. The Pi owns the awkward transport; the phone sees JSON. Shelly uses `requestWithRelayFallback`
   (direct first, relay if the phone cannot route to it), the Roku pattern.
2. **One shared base class, `PerRequestDriver`** (`src/drivers/shared/`), holds the lifecycle every request/response
   driver needs: state map and listeners, deduped `connect()`, generation counter so `disconnect()` beats an in-flight
   refresh, jittered backoff reconnect (`withBackoffJitter`), and self-heal of a moved DHCP address by MAC then name
   (ADR-HEARTH-126). Each new driver implements only `readValues` and `perform`. Kasa and Roku keep their own copies;
   migrating them is not part of this change (they have their own long-tuned tests). Rationale: ADR-GLOBAL-003 (small
   single-purpose pieces) and four copies of ~130 lines would be four places for a reconnect bug.
3. **Honest capabilities.**
   - Vizio: power, volumeUp, volumeDown, mute, inputSelection, directionalNavigation, select, back, home, menu. No
     `setVolume` (the TV's volume setting needs a hash handshake not implemented) and no app launching.
   - Wiz and LIFX: power, setBrightness, setColor. Wiz clamps brightness to the bulb's 10-100 range; a brightness or
     colour command also turns the bulb on. Colour is hue 0-360 / saturation 0-100 (the Hue driver's convention); Wiz
     needs RGB so `colorConversion.ts` converts; the LIFX proxy speaks hue/saturation/brightness directly.
   - Shelly: power only, per channel (`config.channel`, default 0). Generation (Gen1 vs Gen2+) is detected once from
     `GET /shelly` and saved in `config.generation`. A Shelly with login enabled answers 401 and gets a plain
     "turn its login off" error; digest auth is not implemented.
4. **Vizio pairing is a PIN on a custom screen** (`AddVizioDeviceScreen`, `vizioPairingFlow.ts`): `/pairing/start`
   tries port 7345 then 9000, the TV shows a PIN, `/pairing/pair` returns an `AUTH` token saved in
   `device.config.authToken` with the working `port`. Not a timed pairing session: the TV's PIN does not expire on a
   short clock we know of, so there is no countdown.
5. **Discovery recognition.** Phone-side: `vendorPattern` hostname/MAC-vendor rules in `brandRegistry.ts` (Wiz is
   ordered before Hue because Wiz bulbs may carry a Signify vendor string), `deviceKind.ts` patterns, and one SSDP
   target for Vizio (the generic DIAL search target, accepted only when SERVER mentions "vizio"). Wiz, LIFX and Shelly
   do not answer SSDP. The mDNS/UDP recognition (`_viziocast._tcp`, Wiz UDP broadcast `getPilot`, `_shelly._tcp`)
   belongs on the Pi's `/discover/all` sweep, which already returns a `brand` id the phone validates with
   `isBrandId`; the new ids are accepted the moment the Pi sends them.
6. **Plain-language copy**: brand hints, setup guides (`deviceSetupSteps.ts`) and Vizio pairing prompt/failure text in
   `pairingCopy.ts`.

## Family Command Center routes required (NOT implemented; the Pi was not edited)
All are bearer-authenticated like the existing `/api/integrations/hearth/*` routes.
- `POST /api/integrations/hearth/vizio/request` body `{ip, port, method: "GET"|"PUT", path, authToken?, body?}` ->
  `{status: number, body: string}`. Makes the HTTPS request to `https://<ip>:<port><path>` with certificate
  verification off, header `AUTH: <authToken>` when given, `Content-Type: application/json`, and returns the TV's raw
  status and body text unmodified.
- `POST /api/integrations/hearth/wiz/request` body `{ip, method: "getPilot"|"setPilot", params?}` -> the bulb's own JSON
  reply (`{result: {...}}` or `{error: {code, message}}`). Sends one UDP datagram to `<ip>:38899` and waits for the
  reply with a short timeout.
- `GET /api/integrations/hearth/lifx/state?ip=` -> `{power: boolean, hue: 0-360, saturation: 0-100, brightness: 0-100,
  label: string}` (LIFX GetColor/State, converted from 16-bit units).
- `POST /api/integrations/hearth/lifx/set-power` `{ip, on}` -> `{}`.
- `POST /api/integrations/hearth/lifx/set-color` `{ip, hue?, saturation?, brightness?}` -> `{}`; missing fields keep
  the bulb's current value (the Pi reads the state first).
- Discovery: extend `/discover/all` to emit `brand: "vizio" | "wiz" | "lifx" | "shelly"` from `_viziocast._tcp` /
  ports 7345 and 9000, a Wiz `getPilot` UDP broadcast on 38899, LIFX UDP 56700 GetService, and `_shelly._tcp` /
  `_http._tcp` names starting `shelly`.

## Consequences
- Vizio, Wiz and LIFX need Family Command Center (`needsFcc: true`); the "needs FCC" registry test lists them.
- Wire formats (Vizio endpoints and key codes, Wiz pilot fields, Shelly Gen1/Gen2 paths) come from the community
  clients pyvizio and pywizlight and Shelly's public API docs. None has been exercised against real hardware; see
  Verification.
- Not done: Wiz/LIFX/Shelly local discovery on the phone; Shelly digest auth; Vizio absolute volume and app launch;
  device-list UI treatment beyond the existing generic light/outlet/TV screens.

## Verification
- Unit tests with mocked transport for each client and driver; all four drivers added to the shared contract suite
  (`adapters.ts`), which passes for them with no exemptions.
- Real against hardware: nothing yet.
