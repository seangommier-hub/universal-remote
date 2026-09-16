# ADR-HEARTH-071: Sony IRCC-IP for directional nav/select/back/home

**Date:** 2026-09-16
**Status:** Accepted, implemented; not yet live-verified against real hardware

## Context

Phase 1 of `ROADMAP.md` explicitly deferred this since the project's start: "IRCC-IP research +
implementation for directional nav/select/back/home/menu (separate follow-up ADR)." Sony's REST
API (already implemented — power/volume/input) has no method for any of these; they live in a
completely separate protocol.

## Research

Corroborated the IRCC-IP SOAP envelope shape and code table from two independent real sources,
not guessed:

1. A real device dump (`getRemoteControllerInfo` output for a Sony KD55XH9296BU) —
   https://gist.github.com/henrik/32bb3b037b728b81a560d3676c7cfcf7
2. `AlecJDavidson/sony_bravia_api`, a maintained community Python client — its `iirc_codes.py`
   (labeled "Sony RMF-TX500 Remote Control IIRC Codes") and `sony_bravia_api.py` (the exact
   `X_SendIRCC` SOAP envelope and headers) were both fetched and read directly.

Both sources agree byte-for-byte on every code this driver uses. Sony's own official docs
(pro-bravia.sony.net) confirm the mechanism itself (codes are discovered per-device via
`getRemoteControllerInfo`, sent via `POST /sony/ircc`) but the page's own code table is
client-side-rendered and wasn't extractable directly — the two sources above are the actual values
used.

## What was built

- `SonyIrccClient.ts` — a new, separate client from `SonyBraviaClient.ts` (different protocol:
  SOAP-over-HTTP, not JSON-RPC), same `{ipAddress, psk}` config and PSK auth header.
- `SonyBraviaDriver.ts` extended: `directionalNavigation`, `select`, `back`, `home` now declared
  and implemented via `SonyIrccClient`.
- **`menu` deliberately NOT declared** — neither source has a plain, universal "Menu" code on this
  remote's real key table (only app-specific variants like `ActionMenu`/`SyncMenu` exist), and
  guessing which one a caller means isn't something this driver will do. Matches this codebase's
  existing precedent (Roku's own driver omits `menu` for the identical reason).
- **`textEntry` deliberately NOT declared** — IRCC-IP only ever sends discrete named remote-button
  codes, no literal-character or string-insertion mechanism exists in either source (see
  ADR-HEARTH-072 for where text entry *is* implemented — Roku and LG only).
- No FCC/relay changes needed — IRCC-IP uses port 80, already in `ALLOWED_RELAY_PORTS` from
  Sony's existing REST API relay.

## Verification

11 new tests (`SonyIrccClient.test.ts`, plus `SonyBraviaDriver.test.ts` extended) verify the exact
SOAP envelope, headers, and code values against both corroborating sources. Full suite passes,
`tsc --noEmit` clean. **Not live-verified against a real Sony TV** — per `ROADMAP.md`'s own
"Out-of-band" notes, Sony's real-hardware checkpoint has never been completed at any point in this
project's history (flagged there as of 2026-09-09, still unresolved) — this driver's power/volume/
input capabilities were never confirmed against real hardware either, so this is a continuation of
an existing, already-flagged gap, not a new one this change introduces.

## Consequences

- Sony TVs now get the same d-pad/Select/Home/Back UI as Roku/LG/Samsung, automatically — the UI
  is purely capability-gated, no Sony-specific UI code was needed.
- The still-open real-hardware checkpoint (this ADR and every prior Sony capability) remains the
  single biggest source of risk for this driver — worth prioritizing if Sean's Sony TV becomes
  available to test against.
