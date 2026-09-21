# ADR-HEARTH-123: Usable when off the home WiFi (public tunnel fallback)

**Date:** 2026-09-21
**Status:** Accepted, implemented; not yet live-verified against a real away-from-home session

## Context

Sean, directly: "this should be something that can still be used even when off network. find a
way to do that." Investigated first: Family Command Center's relay API (`/api/integrations/hearth/*`,
port 3210) and LG/Samsung's WebSocket relay (port 3211) were LAN-only — nothing public-facing.
Off the home WiFi, Hearth had no path to any device at all.

Asked directly which approach: a scoped public tunnel with hardened auth, a full VPN back into
the house, or deferring this. Sean chose the scoped public tunnel.

## Decision

**Server side** (Family Command Center, separate repo — see its own adr/0182): extended the
already-registered Cloudflare Tunnel with two new hostnames — `hearth-relay.carddna.app` (HTTP
relay + device lookup) and `hearth-ws.carddna.app` (LG/Samsung WS relay) — and added rate limiting
to `isAuthorizedHearth`. `HEARTH_API_TOKEN` itself needed no rotation (already 192-bit random,
constant-time compared).

**Client side** (this repo): `FamilyCommandCenterConfig` gets a new optional `publicBaseUrl` field,
saved in plain `AsyncStorage` (a hostname, not a credential — `token` is still the only secret and
is reused for both LAN and public access). Set once in the existing Settings screen, verified
before saving (same "test before saving" contract the LAN address already has), and left blank by
default — nothing changes for a household that only ever uses Hearth at home.

Both relay-fallback modules gained a third leg, only ever attempted when the first two genuinely
can't reach anything:

- **`httpRelayFallback.ts`**: direct-to-device → LAN relay (`config.baseUrl`) → public relay
  (`config.publicBaseUrl`), the last step gated on a new `FccUnreachableError` type that
  distinguishes "couldn't reach Family Command Center at all" from "reached it, and it explicitly
  rejected the request" (wrong token, malformed request, unknown device) — only the former
  triggers the public fallback. A real rejection retrying elsewhere would mask a genuine problem,
  not fix one.
- **`wsRelayFallback.ts`**: direct → LAN relay (`ws://`, port 3211) → public relay (`wss://`, no
  explicit port — Cloudflare terminates TLS on 443 and forwards internally). The public WS
  hostname is *derived* from `publicBaseUrl` by a naming convention (`hearth-relay.` → `hearth-ws.`)
  rather than asking Sean to configure a second URL — safe because both hostnames are always
  provisioned together as a pair on the tunnel side (adr/0182).

Away from home, the LAN leg fails fast (nothing there to answer — no long hang), so this adds
exactly one more real network attempt before falling through to the public path, not a silent
delay.

## Testing

14 new tests: `httpRelayFallback.test.ts` (+3: successful public fallback, no-fallback-on-a-real-
rejection, and unchanged behavior with no `publicBaseUrl` configured), `wsRelayFallback.test.ts`
(new file, 6 tests — this module had no dedicated test file before this change, now does: direct
success, LAN relay fallback, public fallback after both fail, no-publicBaseUrl regression check,
and a LAN-relay-timeout-then-public-fallback case), `familyCommandCenterConfig.test.ts` (+5:
`publicBaseUrl` load/save round-trip, `verifyAndSavePublicUrl`'s verify-before-save contract,
clearing it with an empty string, rejecting when the LAN config isn't set up yet, and not saving
on a rejected token). `npx tsc --noEmit` clean; full suite 956/956 passing.

## Consequences

- A household that never leaves home sees no behavior change at all — `publicBaseUrl` stays unset,
  every code path is identical to before this ADR.
- Live-verified server-side (the public endpoints are reachable and correctly authenticated — see
  adr/0182); **not yet live-verified end-to-end from a real phone actually off the home WiFi** — no
  device was away from the network to test with this session. The real test is whether a
  genuinely-offsite phone can control a real device through this path.
- Depends on Family Command Center's own tunnel/rate-limiting changes (adr/0182) already being
  deployed — coupled by design (this feature does nothing without that server-side half), not an
  accidental cross-repo dependency.
- Doesn't help if Family Command Center itself is down/unreachable (power outage, Pi offline) —
  the public tunnel only helps when the *phone's* network is the problem, not the Pi's. A true
  "no network path exists at all" scenario (both ends fully offline) remains genuinely unsolvable
  by any software change, and was scoped out explicitly when Sean chose this option over a
  bigger architecture change.
