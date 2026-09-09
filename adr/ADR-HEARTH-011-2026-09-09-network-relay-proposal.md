# ADR-HEARTH-011: Relay transport via Family Command Center for cross-segment device control

**Date:** 2026-09-09
**Status:** Proposed — pending Family Command Center's agreement on the API shape, not yet implemented

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

## Consequences

- Not implemented yet. This ADR will be updated (or superseded) once
  Family Command Center confirms the API shape or proposes a different one.
- If built, every driver client (`SonyBraviaClient`, `SamsungTizenClient`,
  `LgWebOsClient`, `RokuEcpClient`) needs modification to attempt the
  fallback — a real, non-trivial change across all four, not a small patch.
- The WebSocket relay (Samsung/LG) is materially harder than the HTTP relay
  (Sony/Roku) — a generic bidirectional byte pipe, not a simple
  request/response proxy. If Family Command Center wants to phase this,
  HTTP-relay-first (covering two of four drivers) is a reasonable smaller
  first step rather than requiring both at once.
