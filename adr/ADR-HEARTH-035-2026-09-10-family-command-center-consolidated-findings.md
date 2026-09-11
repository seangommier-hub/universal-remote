# ADR-HEARTH-035: Family Command Center (the Pi) — consolidated integration findings

Date: 2026-09-10

## Status

Accepted. Reference document — records no new decision on its own, indexes
and summarizes decisions already made across six earlier ADRs so tonight's
Pi-related findings live in one place instead of scattered across a night
of live troubleshooting.

## Context

Sean, directly: "back up findings on the pi as an ADR." Tonight's live
troubleshooting session (the LG TV connection saga) touched the Family
Command Center (the household's Raspberry-Pi hub) from several angles at
once — network topology, its device-inventory API, its relay, its planned
VNC endpoint — and those findings are currently spread across
ADR-HEARTH-010, -011, -017, -021, -033, and -034. This document is the
single place to look first for "what does Hearth know about the Pi,"
linking back to each source ADR for the full decision record rather than
re-deriving them.

## What the Family Command Center actually is, to Hearth

One Raspberry Pi on the household network, running its own separate
codebase (not this repo, not buildable from here). Hearth treats it as an
optional "sister system," never a hard dependency — every feature below
degrades to "unavailable" rather than "broken" if the Pi isn't configured,
per the information/control boundary Sean confirmed directly (ADR-010):
**Family Command Center senses the household (network inventory, device
presence); Hearth controls it (drivers, commands, real device state).**
Neither app should grow the other's responsibility.

Hearth stores the Pi's base URL (AsyncStorage) and a bearer token
(SecureStore) — the same credential-storage split as every device's own
config — paired once via QR code (ADR-HEARTH-012, not detailed further
here since it predates tonight).

## Endpoints Hearth actually calls on the Pi, and what each is for

| Endpoint | Direction | Used by | Purpose |
|---|---|---|---|
| `GET /api/integrations/hearth/devices` | Hearth → Pi | `FamilyCommandCenterDiscoveryProvider` (ADR-010), `familyCommandCenterDeviceLookup.ts`'s `findCurrentIpByMac`/`findMacByIp` (ADR-017) | Device inventory scan for "+ Discover Devices," AND tonight's real fix for TVs whose IP changes networks — same endpoint, two different call sites |
| `POST /api/integrations/hearth/relay/http` | Hearth → Pi → device | `httpRelayFallback.ts` (ADR-011) | Sony/Roku command relay when the phone can't reach the device directly (different network segment) |
| WebSocket `/api/integrations/hearth/relay/http`-sibling for WS | Hearth → Pi → device | `wsRelayFallback.ts` (ADR-011) | Same fallback, for Samsung/LG's persistent-socket protocols |
| `wss?://.../api/integrations/hearth/relay/vnc` | Hearth → Pi → local VNC server | `familyCommandCenterVncRelay.ts` (ADR-033) | **Not yet implemented on the Pi's side** — see Open Items below |

All four are gated by the same bearer token; none require Hearth to store
anything about the Pi's own network beyond that token and base URL.

## Real network topology, confirmed live (not assumed)

- The household has at least four visibility buckets from the Pi's own
  Pi-hole-backed inventory: **Primary** and a **Pi-managed kids' AP** are
  visible to `/api/integrations/hearth/devices`; **Guest** and **IoT** are
  not, because Pi-hole itself has no DNS/DHCP visibility into those two
  segments — confirmed directly by Family Command Center's own live
  router-admin session (ADR-010's update). Closing that gap required
  Sean's explicit sign-off to store router admin credentials
  server-side on the Pi (authorized 2026-09-09, ADR-010) — implemented on
  the Pi's own side, not this repo.
- What looked like a fourth "ext" segment was disproven with direct
  evidence: a device's own settings screen showed `192.168.200.x` labeled
  plainly as the Guest subnet on the router's own UI (ADR-010).
- Tonight's LG TV concretely moved from `10.20.30.40` (the Pi-managed,
  isolated segment referenced in ADR-011 as "sewer rat") to `192.168.1.218`
  (the main network) — a real mid-project network change, not a
  hypothetical one, and the direct trigger for building MAC-based
  re-discovery (ADR-017).
- Confirmed directly from this dev machine: a plain script-level connection
  attempt to the TV's old Pi-segment IP (`10.20.30.40`) timed out
  (`ETIMEDOUT`) — this machine sits on a different segment than that
  Pi-managed AP, the same real isolation the relay (ADR-011) exists to work
  around for the phone itself.

## Security model, as actually implemented and hardened

- The bearer token is the "home-specific connection code" by design, not a
  placeholder (Sean, ADR-010: "for security purposes").
- Family Command Center's own security review of the relay (ADR-011) found
  and fixed two real gaps on its side: a redirect-based SSRF bypass on the
  target-IP allowlist, and a missing port restriction (hostname was
  checked, port wasn't). Both fixed on the Pi; nothing required on
  Hearth's side since its four drivers only ever request their own
  protocol's standard port.
- The relay's transport specifics were settled through direct
  back-and-forth, not guessed: WS relay target is a full URL (LG's pointer
  socket path is TV-generated at runtime), relayed as message-framed (not
  a raw byte pipe — Expo Go has no raw TCP access regardless), and
  `ws://` not `wss://` (the Pi's relay has no real TLS underneath; the
  query-string token is the actual auth boundary for this LAN hop).

## Open items — real, not silently dropped

- **VNC relay (ADR-033 Phase 2) does not exist on the Pi yet.** Hearth's
  `RfbClient` is built and tested against a mocked WebSocket replaying real
  RFC 6143 byte sequences — it has nothing real to connect to until the
  Pi runs a local VNC server (x11vnc/TigerVNC on loopback) and exposes
  `/api/integrations/hearth/relay/vnc`. Flagged as the Pi's own follow-up
  work, not assumed done.
- **Router-based IP fallback**, if the device-inventory lookup itself ever
  fails, is a real direction Sean asked for (ADR-017) but explicitly not
  built — router admin APIs vary too much by brand/model to scope safely
  alongside tonight's fix.
- **Multi-network household support as a first-class concept** (Sean:
  "hearth should interact with all networks within the household ecosystem
  for any house") — today's MAC re-discovery is the narrow, reactive
  version of this (fix a stale IP after the fact), not full first-class
  multi-network awareness.
- **MAC-based re-discovery is LG/Samsung only.** Sony/Roku's plain-HTTP
  transport has no `LgUnreachableError`-equivalent distinction to hook the
  same recovery into (ADR-017) — not ported, pending a real stale-IP case
  surfacing for either.
- **Per-device VNC-relay permission** (Sean: "the ability for multiple
  phones with given permission to drive it") is entirely Pi-side scope,
  per ADR-033: Hearth already sends a distinct token per paired phone, but
  the Pi needs to gate the *specific* token's VNC-relay access, with an
  admin-facing grant/revoke surface Sean can use — not built, not
  assumed.

## Consequences

- This document makes no code change and adds no test — it's a reference
  index only. Future work touching the Pi integration should start here,
  then follow the link to whichever ADR above actually governs the
  specific behavior in question, and update that ADR directly (not this
  one) when something here goes stale.
