# ADR-HEARTH-125: Extend the off-network fallback to the VNC relay

**Date:** 2026-09-21
**Status:** Accepted, implemented; not yet live-verified against a real away-from-home session

## Context

Direct continuation of ADR-HEARTH-123, which deliberately scoped the public-tunnel fallback to the
TV relay (HTTP + LG/Samsung WS) and left the VNC relay (`CommandCenterRemoteScreen.tsx`'s
phone-as-trackpad-and-keyboard feature, ADR-HEARTH-033) out — "arguably lower priority... could be
deferred." Sean: "keep working on this." Since the underlying ask ("usable even when off network")
was never scoped to TV control specifically, closing this gap is the natural next piece rather than
a new feature.

## Decision

Same pattern as the LG/Samsung WS relay, one port over: added a third Cloudflare Tunnel hostname,
`hearth-vnc.carddna.app` → `http://localhost:3212` (`hearth-relay-vnc.service`), to the same tunnel
config already extended in ADR-HEARTH-123 (Pi-side, not tracked in this repo — see Family Command
Center's own adr/0182 update).

`familyCommandCenterVncRelay.ts` gets `buildPublicVncRelayUrl()`, deriving `hearth-vnc.<domain>`
from `publicBaseUrl`'s `hearth-relay.<domain>` by the identical naming convention
`wsRelayFallback.ts` already established — no new Settings field, the same one public URL covers
all three relays. `CommandCenterRemoteScreen.tsx`'s `connect()` now tries the LAN relay first and
only falls back to the public one if that fails outright and a public URL is configured — one
fewer leg than the TV relays' three-step fallback, since this screen never attempts a "direct"
connection to the Pi's own display server at all (by design, per this file's own class doc
comment — only ever relays).

## Testing

3 new tests in `familyCommandCenterVncRelay.test.ts` (hostname derivation, `undefined` when no
public URL configured, token URL-encoding) — mirrors the existing `buildVncRelayUrl` tests
exactly. `npx tsc --noEmit` clean; full suite 959/959 passing. Verified live: `hearth-vnc.carddna.app`
returns `426 Upgrade Required` to a plain GET (correct for a WS-only endpoint, confirms the tunnel
route works), and the two existing hostnames (`hearth-relay.`, `hearth-ws.`) are unaffected.

## Consequences

- All three of Family Command Center's relay surfaces (HTTP, LG/Samsung WS, VNC) now have the same
  off-network fallback, using one shared public URL a household only ever configures once.
- Not yet live-verified against a real away-from-home session, same honest caveat as ADR-HEARTH-123
  — the server-side path is confirmed reachable; the real phone-off-WiFi trackpad experience is
  unverified.
- `hearth-vnc-server.service` (the actual `wayvnc` server on the Pi's own display, distinct from
  `hearth-relay-vnc.service`, the relay process this ADR's tunnel route reaches) was observed
  inactive during this session — unrelated to this change (the relay and tunnel routing work
  regardless of whether the underlying VNC server happens to be running at the moment), but worth
  Sean confirming it starts correctly if the real end-to-end trackpad test doesn't connect.
