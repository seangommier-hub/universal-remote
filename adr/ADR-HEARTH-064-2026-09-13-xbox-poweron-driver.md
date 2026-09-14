# ADR-HEARTH-064: Xbox power-on driver, relayed through Family Command Center

**Date:** 2026-09-13
**Status:** Accepted, implemented

## Context

Sean, directly: "do anything you can and look online at other apps like this and figure out what
needs to be added... think of yourself as the top product engineer for a company." Researching
competitor universal-remote/smart-home apps surfaced a concrete, corroborated gap: App Store
reviews of universal remote apps explicitly cite "difficulty connecting to certain devices like
Xbox" as a real, recurring complaint — and this exact household has **two real Xbox consoles**
(found earlier tonight via the router-merge work, ADR-HEARTH-048/0148) that Hearth has zero
support for. This is the single highest-signal finding from the research: a documented industry
gap that this household's own device inventory independently confirms.

## Research

Xbox's SmartGlass protocol has a genuine, official, **unauthenticated** power-on mechanism — a
one-way UDP broadcast, no Microsoft account or pairing required. Confirmed by fetching and reading
the actual source of the OpenXbox project's reference implementation
(`xbox-smartglass-core-python`), not guessed:
- `xbox/sg/enum.py`: `PacketType.PowerOnRequest = 0xDD02`
- `xbox/sg/packet/simple.py`: header is `pkt_type` (uint16 BE) + `unprotected_payload_length`
  (uint16 BE) + `version` (uint16 BE, always 2); payload is `liveid` as an "SGString"
- `xbox/sg/utils/adapters.py`: `SGString` = a uint16-BE-length-prefixed UTF-8 string plus one
  `0x00` terminator byte
- `xbox/sg/protocol.py`: sent via UDP to **port 5050**, to both broadcast (`255.255.255.255`) and
  multicast (`239.255.255.250`), plus directly to the console's own IP when known — 2 attempts,
  matching the reference `Console.power_on()` exactly

Power-off, media control, and any state query all require a full encrypted SmartGlass session (an
RSA/ECDH handshake plus a Microsoft account OAuth token) — a materially larger integration, out of
scope. PS5's equivalent (wake-only via a Remote Play pairing credential) was also researched and is
real, but requires a heavier one-time per-console pairing flow than Xbox's zero-setup broadcast —
scoped as future work, not built tonight.

## Decision

1. **Family Command Center** (`src/lib/network/xbox-client.ts` + `.../hearth/xbox/poweron/route.ts`):
   builds the exact packet above and sends it via Node's `dgram` UDP socket. Lives on the Pi, not
   the phone, because Expo Go has no raw socket module — the same reason LG's SSAP WebSocket
   already relays through Family Command Center, just a different underlying constraint (platform
   capability here, TLS trust there).
2. **Hearth** (`src/drivers/gaming/xbox/XboxDriver.ts`): declares **only** `powerOn` — never
   `power`, `powerOff`, or anything implying a queryable state, per this codebase's own standing
   rule that a driver must never claim a capability it can't perform. `connect()` does no network
   call at all: unlike every other driver here ("never adds a device it hasn't actually reached"),
   there is no side-effect-free way to verify an Xbox that might currently be off — sending a real
   probe would risk waking a console the user only meant to add. The Live ID is trusted as the user
   typed it, read directly off the console's own Settings → System → Console info screen.
3. **New `"gaming"` `DeviceCategory`** (`Device.ts`) and **`XboxAddDeviceScreen.tsx`** with its own
   "Setup This Device" guide (ADR-HEARTH-063's pattern) explaining exactly where to find the Live
   ID, since there is no pairing prompt of any kind to wait for instead.
4. **`FamilyCommandCenterDiscoveryProvider.ts`**: deliberately does **NOT** classify Xbox by DHCP
   hostname even though this household's own data (`XboxOne`) would match cleanly — doing so would
   drive the Discover screen's "Connect" button, which builds device config from discovery data
   alone (no Live ID exists on the network) and would always throw a confusing, unfixable error.
   Left as "Not yet supported," which already gets a fully working "Add manually as..." link
   (ADR-HEARTH-062) with the IP pre-filled into the Xbox form's own Live ID prompt — the honest
   path, not a missed opportunity.

## Testing

`xbox-client.test.ts` (Family Command Center): asserts the exact packet bytes field-by-field
against the reference spec, and that all three targets (broadcast/multicast/direct IP) get sent
across 2 attempts — `node:dgram` mocked at the module boundary, since there's no way to unit-test
"did a real Xbox receive this" (this protocol has no acknowledgment at all). `XboxDriver.test.ts`
(Hearth): declares only `powerOn`; `connect()` never touches the network; a missing Live ID throws
before any request; a successful `powerOn` posts the right body to the right endpoint; a missing
Family Command Center config and a rejected token both fail with clear, distinct messages. 4/4 and
7/7 pass respectively; Hearth's full suite (28 suites / 272 tests) and Family Command Center's
(27 suites / 163 tests) both green; `npx tsc --noEmit` clean on both sides.

**Live-verified 2026-09-13**: the Family Command Center endpoint was hit directly with a placeholder
Live ID and returned `{"sent":true}` — real UDP packets left the Pi on all three targets. On the
Android emulator: the real discovered `XboxOne` tile correctly shows "Not yet supported" with a
working "Add manually as... → Xbox" path, IP pre-filled; the Add screen, its Setup Guide, and the
device detail screen (showing only a Power button, no on/off state — correctly reflecting that this
driver can't know either) all render and behave as designed; tapping Power fired with no error.
**Not yet verified**: whether a real console actually powers on — that needs Sean's own console's
real Live ID (Settings → System → Console info), which this session has no way to obtain or invent.

## Consequences

- Two real Xbox consoles in this household can now be power-cycled from Hearth once their Live IDs
  are entered — the second one's IP/MAC is still unknown (it was offline all night, per tonight's
  router-merge investigation), so only the first (`XboxOne`, 192.168.1.210) can be added right now.
- PS5 power-on, and full Xbox power-off/media control via an authenticated SmartGlass session, are
  both real, researched, buildable follow-ups — deliberately not built tonight given the added
  complexity (PS5's per-console Remote Play pairing; full SmartGlass's OAuth + ECDH handshake).
  Either would warrant its own ADR before implementation, consistent with this project's practice
  of scoping and documenting before building rather than expanding scope silently mid-session.
  PS5 specifically hits a hard wall beyond complexity: registration requires a real PSN account
  OAuth login, something this session cannot perform on Sean's behalf under any circumstance.

## Update 2026-09-14: found and fixed a real dishonesty bug in the status pill, caused by this driver

Live-verifying this driver on the emulator surfaced a real bug in `UniversalTvRemote.tsx`, not in
`XboxDriver.ts` itself: the device-detail screen's power status pill (`isOn = state.values.power
=== "on"`) rendered unconditionally for every device, defaulting to a hardcoded "Off" whenever
`values.power` was simply absent — which is XboxDriver's permanent state, by design (it has no way
to query power state at all, see the class's own doc comment). The Xbox screen was quietly telling
Sean his console was off, a fact this app has no way to actually know, every time he opened it.

Fixed by distinguishing "known off" from "never known" — `knownPower` is `undefined` unless
`values.power` is literally `"on"` or `"off"`, and the pill now hides itself entirely rather than
render a guess. Roku's status pill (which reads a real `powerMode` off the device despite declaring
only `powerOff`, not `power`) was checked and confirmed unaffected — this fix is keyed to whether
real data exists, not which capability is declared, so it doesn't regress the one other driver with
this same "power-off-only, but still reads real state" shape.

Live-verified on the emulator: the Xbox device now shows only "Connected," no power pill at all;
the LG device (real readback) still correctly shows "On." Full suite (272 tests) and `npx tsc
--noEmit` both clean after the change.
