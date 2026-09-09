# ADR-HEARTH-005: Samsung driver targets unencrypted ws://8001 only; wss://8002 deferred

**Date:** 2026-09-08
**Status:** Accepted

## Context

While implementing the second real TV driver (Samsung, to prove the
abstraction per the brief's "second TV integration" milestone), a gap
surfaced in `docs/DEVICE_FEASIBILITY.md`'s original Samsung research: it
said Expo Go's WebSocket "works" for the control channel. That's only true
for the **unencrypted** `ws://<ip>:8001/...` protocol variant. Modern Tizen
TVs (~2020+) commonly require the **encrypted** `wss://<ip>:8002/...`
variant, which uses a self-signed certificate — and React Native's built-in
`WebSocket` has no supported way to accept an untrusted certificate
(confirmed via multiple open `facebook/react-native` GitHub issues and the
existence of a third-party native package built specifically to patch this
gap). Doc corrected in place (see file).

## Decision

`SamsungTizenDriver` (`src/drivers/tv/samsung/SamsungTizenDriver.ts`)
connects only via `ws://<ip>:8001/api/v2/channels/samsung.remote.control`
(plain, unencrypted). It does **not** attempt `wss://8002`.

## Rationale

Building against the encrypted path right now would require a native
TLS-bypass module and therefore an Expo Development Build — a real
capability gap, not a small config change — before any code could even be
tested. Building against the unencrypted path first keeps this driver
honestly Expo-Go-compatible today, consistent with "no fake
implementations": the driver only claims to work where it actually can.

## Consequences

- **This driver may not work at all against Sean's real Samsung TV** if
  that TV's firmware has removed/blocked the unencrypted port 8001 channel
  (common on newer Tizen versions). This must be confirmed by testing
  against the actual hardware — see `scripts/test-samsung-connection.js`.
- If port 8001 turns out to be unavailable on Sean's TV, the real follow-up
  work is: (a) confirm a `wss://8002` self-signed-cert-tolerant native
  WebSocket path (Dev Build + a package like
  `react-native-websocket-self-signed`, or a custom native module), and (b)
  write a new ADR before implementing it, per the mandatory ADR-before-code
  rule.
- Samsung's protocol also has no documented way to jump directly to a
  specific HDMI input (only a generic `KEY_SOURCE` that opens a menu, per
  the `xchwarze/samsung-tv-ws-api` reference `COMMANDS.md`) — so, like
  Sony's missing directional-nav capabilities (ADR-HEARTH-004), the Samsung
  driver does **not** declare `inputSelection` as a supported capability.
