# ADR-HEARTH-210: fccReachable reflects the most recent relay attempt, not just "ever succeeded"

## Status

Accepted

## Context

Sean, directly (2026-10-05), during a real Pi outage: "downstairs saying only reachable through
relay" — the Downstairs Living Room TV's status line read "Reachable through the relay only —
retrying" while Family Command Center (the Pi, and everything on it, including the relay itself)
was confirmed fully down: no ARP entry on the LAN, SSH timed out, and both `hearth-relay.*` and
`hearth-ws.*` (the real public tunnel hostnames) answered `502` the whole time.

Root cause, traced through `deriveRemoteViewState.ts` → `describeDeviceStatus.ts` →
`fccConnectivity.ts`: `connectivityMode` only ever moves to `"away"` on a **success** over the
public route (`recordRouteSuccess("public")`), and nothing ever moved it back. Once a device had
successfully used the relay at any point in the app session, `connectivityMode` stayed `"away"`
indefinitely — including straight through a later outage. `fccReachable` compounded this:
`deriveRemoteViewState.ts` set it to a hardcoded `true` whenever `connectivityMode !== "unknown"`,
never actually checking whether the relay had answered *recently*. `describeDeviceStatus.ts`'s own
`fccReachable === false` branch ("Away, and the relay isn't answering — retrying") was consequently
dead code from every real call site — only reachable in its own unit tests, which construct the
input directly.

Two call sites also never recorded a public-route failure at all: `fccRequest.ts`'s catch block
only called `recordLanFailure()` when `route === "lan"`, doing nothing on a failed public attempt;
`wsRelayFallback.ts`'s `openViaPublicRelay()` (the LG/Samsung WebSocket path — what the Downstairs
TV actually uses) let a failure propagate with no `recordXFailure()` call at all.

## Decision

Added `publicFailedAt` to `fccConnectivity.ts`, mirroring the existing `lanFailedAt`: set by a new
`recordPublicFailure()`, cleared on `recordRouteSuccess("public")`. Exposed as
`isPublicRouteCurrentlyFailing()`. Wired `recordPublicFailure()` into both real call sites that
previously dropped a public failure on the floor (`fccRequest.ts`'s catch block, and
`wsRelayFallback.ts`'s `openViaPublicRelay()`). `deriveRemoteViewState.ts` now derives
`fccReachable` from `!isPublicRouteCurrentlyFailing()` instead of a hardcoded `true`, so
`describeDeviceStatus.ts`'s already-existing (but previously unreachable) "the relay isn't
answering" branch finally fires for real.

`connectivityMode` itself is left as-is (still only a LAN-vs-public routing *preference*, which is
its documented, correct job — ADR-HEARTH-147). This fix only changes the separate `fccReachable`
signal that `describeAway()` next checks.

## Consequences

- A device stuck on "away" during a real outage now reports "Away, and the relay isn't
  answering — retrying" instead of falsely claiming the relay is reachable. Verified via unit
  tests on the fixed logic (couldn't verify against the live Pi — it was down for the actual bug
  report, confirmed back up afterward with the fix already landed, not yet re-tested against real
  hardware).
- No change to request behavior, retry timing, or routing order — this is a status-reporting fix
  only, tracking one more piece of real state.
- New test coverage: `fccRequest.test.ts` (2 new tests — a failed public attempt is recorded, a
  later success clears it) and `wsRelayFallback.test.ts` (2 new tests/assertions — same, via the
  WebSocket relay path). Full suite: 335/335 passing.
- Needs an EAS update to actually reach Sean's and Leah's phones (`feedback_hearth_push_to_leah_too`)
  — not yet shipped as of this ADR; ask before pushing, per device-status-UI changes being
  user-visible.
