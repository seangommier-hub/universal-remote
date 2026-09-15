# ADR-HEARTH-067: TP-Link Kasa smart plug driver (legacy protocol only)

**Date:** 2026-09-15
**Status:** Accepted, implemented; not yet live-verified against a real plug

## Context

Sean, 2026-09-13: "i have some kasa i believe" — asked whether the TP-Link Kasa smart plugs he
believes he owns could be integrated, following the broader "why can't Amazon devices be added"
conversation where Amazon's own smart plugs were confirmed infeasible (no public local-control
API — see docs/DEVICE_FEASIBILITY.md). Kasa is a different, more open product: TP-Link's older
plugs speak a plaintext-ish local protocol with no cloud dependency and no auth at all.

## What was researched, from primary source

Fetched and read python-kasa's own source directly (the reference Python implementation of this
protocol), not community guesses:
- `kasa/transports/xortransport.py` — the wire framing: a 4-byte big-endian length prefix, then a
  rolling-key XOR "encryption" (`INITIALIZATION_VECTOR = 171`; each plaintext byte XORed with a
  running key that's replaced by the *result* on encrypt, or by the *raw ciphertext byte* on
  decrypt). Port 9999, plain TCP, no auth, no TLS.
- `kasa/iot/iotplug.py` — `turn_on`/`turn_off` both call `_query_helper("system",
  "set_relay_state", {"state": 1|0})`.
- `kasa/iot/iotdevice.py` — the JSON envelope shape (`{target: {cmd: arg}}`), and
  `get_sys_info()`/`_extract_sys_info`'s handling of a flat-vs-nested `system.get_sysinfo`
  response shape across different firmware versions.
- `kasa/device_factory.py` — confirmed a real, material limitation: TP-Link's **newer** firmware
  (and Tapo-branded hardware) speaks a completely different, encrypted handshake protocol
  ("KLAP"), not this legacy XOR one, on the same port. This driver cannot talk to a KLAP device at
  all — implementing KLAP would mean a local-auth handshake derived from TP-Link account
  credentials or on-device setup, a materially bigger integration, out of scope here. Same
  category of deliberate scope limit as XboxDriver.ts's power-on-only Xbox support (ADR-HEARTH-064).

## What was built

Mirrors the existing driver pattern (closest analog: SmartThingsOutletDriver for the "outlet"
category/`power`-only capability; closest analog for the relay mechanism: XboxDriver, since Expo
Go has no raw TCP socket module any more than it has a raw UDP one):

- **family-command-center**: `src/lib/network/kasa-client.ts` (the real XOR transport + JSON
  envelope, implemented and tested against a real local TCP server standing in for a plug — not
  mocked, unlike xbox-client.test.ts's UDP-send mock, since this protocol's real value is in a
  bidirectional exchange with real framing/reassembly logic worth exercising for real), two new
  routes under `/api/integrations/hearth/kasa/` (`sysinfo` GET, `set-relay-state` POST), both
  gated by `isAuthorizedHearth` + `isKnownDeviceIp` (the same SSRF-prevention boundary
  ADR-HEARTH-066 already fixed for the HTTP/WS relay — a raw TCP connection to an arbitrary IP is
  exactly the same class of risk). 8 new tests (`kasa-client.test.ts`).
- **universal-remote**: `src/drivers/outlet/kasa/KasaClient.ts` (FCC-proxy client, same shape as
  SmartThingsClient.ts) + `KasaPlugDriver.ts` (`DeviceDriver` impl, capability `["power"]` only —
  no dimming/energy-monitor readback even on plugs whose hardware supports it, matching this
  codebase's "never claim a capability you can't perform" rule). Unlike SmartThingsOutletDriver's
  optimistic post-command state assumption, this protocol has a real readback — `executeCommand`
  re-queries `get_sysinfo` after `set_relay_state` and trusts that over the request, the same
  honesty pattern RokuEcpDriver's `refreshPowerState` already established. 17 new tests across
  `KasaClient.test.ts` + `KasaPlugDriver.test.ts`.
- `AddKasaDeviceScreen.tsx` (IP-only form, no PSK, mirrors AddRokuDeviceScreen.tsx) + a new
  `KASA_SETUP_GUIDE` in `deviceSetupSteps.ts` that states the KLAP limitation up front, not buried
  in a post-failure error. Registered in `bootstrap.ts`, wired into `App.tsx`'s screen switch and
  `DeviceListScreen.tsx`'s `AddableBrand`/`ADD_DEVICE_OPTIONS`.
- Added a `BRAND_MATCHERS` entry to `FamilyCommandCenterDiscoveryProvider.ts` (`/tp-?link|\bkasa\b/i`
  → `KASA_PLUG_DRIVER_ID`) — safe to auto-match (unlike Xbox/SmartThings, which are deliberately
  excluded from that list) because `KasaPlugDriver.connect()` needs only `config.ipAddress`,
  exactly what that screen's discovery-tile "Connect" flow already builds without any extra user
  input. Flagged honestly in-code that, unlike every other entry in that list, this one isn't yet
  confirmed against a real device actually seen on this household's network — TP-Link's MAC OUI
  vendor string is a safe generic match, not household-specific data.

## Verification

Full test suites clean on both repos: family-command-center (30 suites / 186 tests, `tsc --noEmit`
clean, rebuilt and restarted live), universal-remote (30 suites / 289 tests, `tsc --noEmit` clean).

**Not live-verified against real hardware** — no Kasa device currently appears in this household's
live device list (checked directly during this same session's device-list investigation, adr/0170
on the FCC side). Sean said "i have some kasa i believe," not confirmed connected/powered right
now. If/when one is available: adding it will immediately reveal which protocol it actually speaks
(this legacy one, or KLAP) — the setup guide and error message are both written to make that
outcome legible either way, not to over-promise.

## Consequences

- A working, tested, protocol-correct Kasa plug integration exists and is one IP address away from
  controlling a real plug, if the plug runs old-enough firmware.
- A plug on newer KLAP firmware gets a specific, honest error rather than a silent failure or a
  misleading "connected" state — consistent with this project's standing rule.
- KLAP support remains a real, scoped-out gap, not a bug — worth its own future ADR if Sean's
  actual plugs turn out to need it.
