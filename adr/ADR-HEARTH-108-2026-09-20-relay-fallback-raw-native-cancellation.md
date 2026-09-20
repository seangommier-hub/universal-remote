# ADR-HEARTH-108: Relay fallback was leaking a raw native error string instead of a clean message

**Date:** 2026-09-20
**Status:** Accepted, implemented

## Context

Sean, driving the Hisense/Roku TV's on-screen remote through Hearth to navigate to its network
settings (no physical remote available — see the Hisense TV's known isolated-network-segment
situation, ADR-HEARTH-011), reported the app showing "not connected" and this exact error:
`fetchrequestcanceled:exception: fetch request has been canceled (at Expo/NativeResponse.swift:63)`.

Reading `httpRelayFallback.ts` (`requestWithRelayFallback`/`callRelay`, shared by every TV/AV
driver in this project) found the real gap directly, not by guessing: `callRelay`'s catch block
only converts a failure into the clean "Family Command Center didn't respond within Xs" message
when `err.name === "AbortError"` — the shape produced by this file's own deliberate
`controller.abort()` timeout. A cancellation that iOS's native networking layer itself initiates
(confirmed live: Expo's `NativeResponse.swift`) does not necessarily present with that same
`.name`, so the check missed it and `throw err` re-raised the raw, unreadable native string
straight to the UI — a real violation of this project's own standard that no driver ever surfaces
a raw protocol/native exception unexplained.

The specific trigger (not fully certain, but plausible and consistent with the report): this TV
sits on a segment the phone can't reach directly, so *every* command first eats the full 4-second
direct-connection timeout before falling back to the relay (ADR-HEARTH-011's known, accepted cost
for isolated-segment devices) — driving an on-screen remote this way means several taps in quick
succession while each one is still working through that delay, a real condition for iOS to cancel
an in-flight request out from under this code.

## Decision

Added `isCancellation(err)` to `httpRelayFallback.ts`: treats an error as a cancellation (and
surfaces the same clean, retry-able message) whenever `err.name === "AbortError"` **or** its
message matches `/cancel/i` — covering both this file's own deliberate timeout and whatever shape
iOS's native layer produces for an externally-triggered cancellation, without needing to enumerate
every possible native error shape by name. Added a regression test using the exact real message
Sean saw, verbatim, not a synthetic approximation.

## Consequences

- Every driver that goes through `requestWithRelayFallback` (all of them) now gets this same
  protection — not a Roku-specific fix, since the bug lived in shared infrastructure.
- Does not remove the underlying 4-second-per-command delay for a device on an isolated segment —
  that's this project's accepted, disclosed tradeoff (ADR-HEARTH-011), not something this ADR
  changes. Told Sean directly: tapping one button and waiting for it to visibly register before
  the next, rather than rapid-tapping, avoids triggering this path at all while driving an
  isolated-segment device's on-screen remote.
- `npx jest --silent` → 910/910 passing (1 new regression test). `npx tsc --noEmit` clean.
