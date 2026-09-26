# ADR-HEARTH-152: LG pairing survives firmware that rejects the old certificate; faster dead-connection detection

**Date:** 2026-09-26
**Status:** Accepted, implemented; certificate fallback verified only against a TV that still accepts the old manifest

## Context

The connection-reliability research (Home Assistant issues core#179669 and core#172703, ColorControl
#608) reports that newer webOS firmware refuses the pairing manifest's long-blacklisted 2014 test
certificate: "403 Pairing rejected: blacklisted certificate detected". Hearth's LG pairing would then
fail on first pairing of such a TV. The same research showed Home Assistant's LG client pings every
5s, while Hearth's heartbeat (ADR-HEARTH-132) took about a minute to notice a dead connection.

## Decision

- Tested live on Sean's LG (2026-09-26): with its saved client-key, registration succeeded with the
  manifest as-is, without the `signatures` block, and without both `signed` and `signatures`. So the
  unsigned manifest is safe for TVs that already trust the app.
- `LgWebOsClient.connect()` still sends today's manifest first. Only when the TV's reply names a
  blacklisted/certificate refusal does it retry once with an unsigned manifest (permissions kept).
  Any other registration failure is not retried. A TV that accepts the old manifest behaves exactly
  as before.
- `HEARTBEAT_INTERVAL_MS` 20s to 8s (two misses still required), so a silently dead LG connection is
  noticed in roughly 25 seconds instead of about a minute.

## Consequences

- The fallback path (a TV that actually refuses the old certificate, then accepts an unsigned first
  pairing) has been exercised only with a mock; no household TV runs that firmware yet.
- Eight-second probes add a little more traffic to each connected LG.
