# ADR-HEARTH-231: LG register() fails fast unless the TV has shown an approval prompt

**Date:** 2026-10-22

## Context

Sean, directly: "app unresponsive and getting errors when trying to navigate around the lg tv."
Live investigation (Pi SSH): his LG TV was powered on but absent from the entire local subnet (a
full ping sweep found no webOS SSAP responder anywhere on 192.168.1.0/24) — a real Wi-Fi problem on
the TV's own side, not an app bug. But that's not the whole story: Sean, directly, when asked to
narrow it down: "this is about the tv remote from the hearth app not working" — the app going
*unresponsive*, not just erroring, is squarely in Hearth's own control regardless of what's wrong
with the TV's network.

`LgWebOsClient.connectWithManifest()`'s register handshake used one fixed 30s timeout
(`LG_PAIRING_TIMEOUT_MS`) for every connect attempt — sized for a human to physically walk over and
tap the on-screen approval prompt during a genuine first-time (or reset) pairing. Against a TV
whose network comes up just enough to open the WebSocket but never answers `register` at all (no
prompt, no error — exactly Sean's TV), that meant 30 seconds of total silence before any error
surfaced. `CALL_TIMEOUT_MS` (this same file, 8s) already documents the identical hang-without-a-
sane-timeout bug class from 2026-09-21 ("the app stayed stuck showing 'Reconnecting...'"); this is
that same pattern one level up the connection, in the handshake this file's own `call()` fix didn't
cover.

## Decision

Two-stage timeout instead of one fixed 30s wait:

- Register now fails at `CALL_TIMEOUT_MS` (8s) by default — the same "a real request answers in
  well under a second; 8s is generous headroom" reasoning this file's own `CALL_TIMEOUT_MS` comment
  already uses, since an already-paired TV answering register (accept or reject) is just as fast as
  any other SSAP request.
- Only if the TV has actually signaled an approval prompt within that first 8s (`onPrompt` fires,
  `promptShown` becomes true) does the timeout escalate to the remaining budget, reaching the full
  original 30s total — the one case that genuinely needs a human's time, not the TV's.
- No change to which message/error type fires at whatever point the timeout does land (first-time
  vs. saved-key vs. refused-pairing messaging, ADR-HEARTH-223) — only when the clock runs out.

## Consequences

- A TV with a flaky/absent network link now fails in ~8s instead of ~30s, with the existing
  CommandErrorBanner (ADR-HEARTH-226) and reconnect UI surfacing something to the user roughly 4x
  sooner — directly answering "unresponsive," independent of whatever is actually wrong with the
  TV's own Wi-Fi.
- A genuine first-time pairing, or a saved key the TV positively refuses (both of which show a real
  on-screen prompt), still get the full 30s — unchanged from before.
- New test: `LgWebOsClient.test.ts`, "silence with no approval prompt at all fails fast at
  CALL_TIMEOUT_MS (8s), not the full 30s pairing budget." All 28 existing tests in that file still
  pass unchanged, including the two that exercise the full-30s path.
- Does not fix the TV's own Wi-Fi — that's still a real, separate problem on Sean's end. Flagged to
  him directly rather than assumed fixed by this change.
