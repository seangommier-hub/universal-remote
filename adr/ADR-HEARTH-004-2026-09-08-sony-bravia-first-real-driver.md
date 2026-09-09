# ADR-HEARTH-004: Sony BRAVIA as the first real driver; capability scope

**Date:** 2026-09-08
**Status:** Accepted

## Context

Per `docs/DEVICE_FEASIBILITY.md`, Sony's BRAVIA REST API is the strongest
researched TV integration (official, local, plain HTTP, stable, low auth
friction). Sean confirmed he owns a Sony TV among others (Samsung, LG,
Hisense, Roku), so it's also directly testable — satisfying both the
feasibility and "user value / testability" criteria from the brief.

Per `AGENTS.md`, the exact versioned Expo v57 docs and the SDK 57 changelog
were checked before writing this code: no breaking changes affect `fetch`,
networking, or `app.json` for this driver.

## Decision

1. `SonyBraviaClient` (`src/drivers/tv/sony/SonyBraviaClient.ts`) implements
   the documented JSON-RPC envelope only — POST to `http://<ip>/sony/<service>`,
   `X-Auth-PSK` header, `{method, id, params, version}` body. Sourced from
   Sony's own REST API reference (see file header for URLs).
2. `SonyBraviaDriver` declares only **`power`, `volumeUp`, `volumeDown`,
   `setVolume`, `mute`, `inputSelection`** — NOT `directionalNavigation`,
   `select`, `back`, `home`, or `menu`. Sony's JSON-RPC REST API has no
   method for those; that functionality lives in Sony's separate IRCC-IP
   protocol (infrared-code-over-IP), which has not been researched or
   implemented.
3. `Device` gained an optional `config?: Record<string, unknown>` field to
   carry driver-specific connection data (Sony needs `{ ipAddress, psk }`).
4. Every mutating command (`power`, `volumeUp`, etc.) re-reads actual state
   from the TV afterward (`refreshState`) rather than assuming the command
   applied — the returned `CommandResult.state` reflects what the TV
   actually reports, not what was requested.

## Rationale

Declaring a capability a driver can't perform would violate the project's
"No Fake Implementations" / "No Unsupported Claims" rules directly — the UI
would render a d-pad that silently does nothing. Scoping the capability list
to exactly what's implemented keeps `UniversalTvRemote`'s capability-gated
rendering honest for a real device, not just for mocks.

Re-reading state after every command (rather than trusting the command
succeeded) matches the brief's explicit "do not blindly assume commands
succeeded" principle, and is only possible because Sony's `getPowerStatus`/
`getVolumeInformation` are cheap, fast, documented reads.

## Consequences

- Sony TVs in Hearth will not have a working d-pad/menu/home/back until a
  future ADR adds IRCC-IP support — this is a known, documented gap, not an
  oversight.
- This driver is unit-tested against a mocked `fetch` (27/27 tests passing)
  but **has not yet been validated against Sean's real TV**. See
  `scripts/test-sony-connection.js` for a fast, UI-independent way to do
  that once IP Control + PSK are set on the physical TV.
- Any second TV driver (Phase 2, per `ROADMAP.md`) should follow the same
  pattern: declare only capabilities it can actually perform, verified
  against sourced documentation, not assumed from the mock drivers' shape.
