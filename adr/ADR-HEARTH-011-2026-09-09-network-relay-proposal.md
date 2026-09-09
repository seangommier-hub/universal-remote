# ADR-HEARTH-011: Relay transport via Family Command Center for cross-segment device control

**Date:** 2026-09-09
**Status:** Implemented on Hearth's side, pending one open question before end-to-end testing

## Context

Sean, verbatim, after confirming his 75" LG TV (`10.20.30.40`) sits on a
network segment ("sewer rat," the Pi-managed AP) genuinely unreachable from
this dev machine: "i don't want it to have to [switch networks]. these
devices are all on my wifi that i pay for."

The constraint is physical, not a Hearth bug: a phone joins exactly one
WiFi network at a time. If a router keeps Primary/Guest/IoT/kids-AP
segments truly isolated (confirmed for at least Guest and the Pi-managed
segment — see ADR-HEARTH-006 and ADR-HEARTH-010's updates), a phone on one
segment cannot reach a device on another, and no client-side code changes
that.

## Decision (proposed)

Extend Family Command Center's discovery integration (ADR-HEARTH-010) with
a relay transport, used as a **fallback**, not a replacement:

1. Every driver's direct-connection path (current behavior: `fetch`/`WebSocket`
   straight to the device IP) stays the fast path and default — Hearth
   keeps working with zero Family Command Center dependency when a device
   is reachable directly, per the project's local-first design principle.
2. When a direct connection fails, and Family Command Center is configured
   (same bearer token already used for discovery), fall back to a relay:
   - `POST /api/integrations/hearth/relay/http` for the two HTTP-based
     drivers (Sony BRAVIA, Roku ECP) — Family Command Center's backend
     makes the real local request from wherever it can reach, returns the
     response.
   - A WebSocket byte-relay for the two WebSocket-based drivers (Samsung
     Tizen, LG webOS) — Family Command Center opens the real local
     WS/TCP connection and pipes bytes bidirectionally.
3. Hearth-side: a transport abstraction the four driver clients use instead
   of calling `fetch`/`WebSocket` directly, so this is one shared seam
   rather than four separate implementations.

Proposed to the family-command-center session for their agreement on the
exact API shape before any code is written on either side — not being
built unilaterally.

## Rationale

Keeps the information/control boundary from ADR-HEARTH-010 intact: Family
Command Center provides network *reach* (an extension of the visibility it
already has for discovery), Hearth still decides *what* commands to send —
the relay carries bytes, it doesn't understand BRAVIA/SSAP/ECP protocol
semantics. Falling back rather than always relaying preserves Hearth's
ability to function without Family Command Center at all, matching the
brief's "the application must also function independently" requirement for
optional integrations.

## Update 2026-09-09: implemented

Family Command Center built both endpoints, agreeing to the shape
proposed above with two refinements settled through direct back-and-forth
(both driven by what Hearth's actual client code needs, not guessed):

- **WS relay target is a full URL, not decomposed ip:port** — required
  because LG's pointer-input socket path is generated dynamically by the TV
  at runtime (`ssap://com.webos.service.networkinput/getPointerInputSocket`
  returns a TV-chosen path), which a fixed ip:port scheme can't carry.
  Validation checks only the hostname/IP portion against Pi-hole's known
  devices, ignoring path/query.
- **Message-relay, not raw-byte-pipe** — confirmed necessary, not just
  simpler: Hearth's driver code depends on WebSocket message *framing*
  (one `.send()` call arrives as exactly one `onmessage` event), and Expo
  Go has no raw TCP socket access anyway, so a byte-pipe scheme would need
  a client capability Hearth doesn't have.
- **Auth token as a WS query param, not a header** — corrected before
  building: React Native's `WebSocket` constructor cannot set custom
  headers, so `Authorization: Bearer <token>` (used for the HTTP relay)
  isn't available on the WS handshake. Token travels as `?token=...`
  alongside `?target=...`, same place both already live.

Hearth-side: `src/core/network/httpRelayFallback.ts` (Sony, Roku) and
`src/core/network/wsRelayFallback.ts` (Samsung, LG) — both try direct
connection first (`DIRECT_CONNECT_TIMEOUT_MS`/timeout-guarded) and only
call Family Command Center if that fails. All four driver clients updated
to route through their respective helper instead of calling
`fetch`/`WebSocket` directly. 71/71 tests passing, including new coverage
for the fallback triggering correctly.

**One open question before this can be tested end-to-end**: Family Command
Center's relay was specified as `wss://<pi-ip>:3211` (TLS). If that
certificate is self-signed, React Native's `WebSocket` cannot connect to it
at all — the same wall documented in ADR-HEARTH-005/006 for the devices'
own local encrypted ports. Asked Family Command Center to confirm whether
it's genuinely TLS (and with what cert) or `ws://` was intended; Hearth's
scheme is read from a constant (`RELAY_SCHEME` in `wsRelayFallback.ts`),
not hardcoded per-callsite, so this is a one-line fix once confirmed either
way. Not yet validated against real hardware regardless — that requires
this question resolved first.

## Consequences

- Every driver client (`SonyBraviaClient`, `SamsungTizenClient`,
  `LgWebOsClient`, `RokuEcpClient`) now depends on
  `src/discovery/familyCommandCenterConfig.ts` transitively (to check for
  relay fallback config) even when Family Command Center isn't in use —
  this required a global Jest mock (`jest.setup.js`) for
  `@react-native-async-storage/async-storage`/`expo-secure-store` so their
  test files don't crash on that import chain in the plain Jest/Node
  environment.
- The WS relay fallback introduces a genuine extra microtask hop between a
  socket opening and a driver's handshake logic resuming (constructing the
  socket now happens inside an awaited helper rather than inline). Several
  existing mock-driven tests had timing assumptions that broke because of
  this — fixed with a shared `flushMicrotasks()` test helper
  (`src/testUtils/mockWebSocket.ts`), not by weakening the tests.
