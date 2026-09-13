# ADR-HEARTH-047: The HTTP relay's own leg had no timeout — Sony/Roku/Hue/SmartThings could hang forever mid-connect

Date: 2026-09-12

## Status

Accepted.

## Context

Sean, in passing, without detail: "the ability to connect to other devices" is broken. No
elaboration given, so this session exercised every real connection path rather than guessing
which one he meant — Discover Devices, each manual Add*Screen, and the auto-reconnect logic
(ADR-HEARTH-017) — reading code and cross-checking it against the actual real-hardware findings
already on record in this project's ADRs, since real hardware (Sean's phone, his LG TV) isn't
reachable from this session.

Two real, previously-unfixed bugs turned up, both instances of the exact same failure class this
project has already found and fixed once before:

**`src/core/network/httpRelayFallback.ts`** — `requestWithRelayFallback()`'s direct leg already
had a timeout (`DIRECT_TIMEOUT_MS`, `fetchWithTimeout`), but its own `callRelay()` fallback called
`fetch()` on Family Command Center's relay endpoint with no timeout at all. This function backs
Sony, Roku, and Hue's every HTTP call (confirmed by reading `SonyBraviaClient.ts`,
`RokuEcpClient.ts`, `HueBridgeClient.ts` — all three call `requestWithRelayFallback`, never raw
`fetch`). Any device reached through the relay — the exact path this project built specifically
for devices on a different network segment than the phone (ADR-HEARTH-011, and ADR-HEARTH-035's
real Guest/IoT/kids'-AP topology) — could hang the calling screen forever if the relay or the
device behind it was slow or unresponsive, with no error and no way to recover short of leaving
the screen. No test file existed for `httpRelayFallback.ts` at all, so nothing caught this.

**`src/drivers/outlet/smartthings/SmartThingsClient.ts`** — `fccRequest()` (backing
`listOutlets()`/`setOutletState()`, i.e. `AddSmartThingsOutletsScreen`'s "Sync from SmartThings")
had the identical gap: a plain `fetch()` with no timeout at all.

This is the same failure mode ADR-HEARTH-010's 2026-09-09 update already found and fixed once, in
`FamilyCommandCenterDiscoveryProvider.scan()` — that update's own words apply verbatim here: "a
slow or hung response left [the screen] stuck ... forever, with no error, no way to recover short
of leaving the screen — indistinguishable from the app being broken." That fix, plus
`wsRelayFallback.ts`'s equivalent timeouts, were the two `httpRelayFallback.ts`/discovery got
right; this ADR closes the two places that were missed when that convention was established —
`httpRelayFallback.ts`'s own relay leg (ironically, the file the discovery-scan fix's comment
cites as the model to follow) and `SmartThingsClient.ts`, added later (ADR-HEARTH-042) and never
checked against this specific convention.

## Decision

Both fetches now use the same `AbortController`-based timeout shape already established
elsewhere in this codebase:

- `httpRelayFallback.ts`: `callRelay()` now calls the file's own `fetchWithTimeout` helper (the
  same one the direct leg already used) with a new `RELAY_TIMEOUT_MS = 8000` — matching
  `wsRelayFallback.ts`'s `RELAY_CONNECT_TIMEOUT_MS` for consistency between the HTTP and WebSocket
  relay paths. An `AbortError` is caught and rethrown as a clear, specific message naming the
  target IP/port, distinguishing a timeout from a genuine relay rejection.
- `SmartThingsClient.ts`: `fccRequest()` gained the identical `AbortController` + `setTimeout`
  pattern `FamilyCommandCenterDiscoveryProvider.scan()` already uses, same `8000`ms value, rethrown
  as a `SmartThingsApiError` (status `0`, to distinguish "never got a response" from a real HTTP
  status) with a clear message.

Both timeouts fire in addition to, not instead of, the existing per-call error handling — a real
non-2xx response or a genuine network failure surfaces exactly as before; only the previously
uncovered case (the request just never resolves) now has a bound.

## Consequences

- 207/207 tests passing (5 new: a new `httpRelayFallback.test.ts` — this file had zero test
  coverage before this change — covering the direct-success, direct-fail-then-relay-success,
  relay-timeout, and no-FCC-configured cases; plus one new timeout test in
  `SmartThingsClient.test.ts`), `tsc --noEmit` clean. Real timers used for both new timeout tests,
  not fake ones — this project's established tradeoff (documented in
  `FamilyCommandCenterDiscoveryProvider.test.ts`, `ADR-HEARTH-017`): `AbortController`'s event
  dispatch interacting with fake-timer microtask ordering has proven flaky here before.
- Not verified against real hardware from this session (no access to Sean's phone, LG TV, or
  Family Command Center Pi) — this is a static-review fix on a real, previously-uncovered gap in a
  shared, heavily-used code path, not a live-tested one. The next real checkpoint is Sean actually
  hitting a slow/unresponsive relay leg for a Sony/Roku/Hue/SmartThings device and seeing a clear
  error instead of an indefinite spinner.
- Also found, and separately worth a correction (see the update this ADR adds to
  `ADR-HEARTH-045`): that ADR's claim that LG/Samsung device control "will not work" under Expo
  Go's `--go` mode is very likely stale/incorrect — `ADR-HEARTH-014`'s relay-based fix means
  neither driver needs the native TLS trust-anchor Expo Go actually lacks. Flagged there, not
  fixed here, since it's a documentation correction, not a code change, and this session had no
  way to verify LG/Samsung pairing against real hardware to confirm the positive case.
- Did not change `DeviceListScreen.tsx` or `UniversalTvRemote.tsx` (a separate agent's
  in-progress layout fix) or anything Apple-signing/SideSign/MacinCloud-related, per this
  session's own scope boundaries.

## Related

ADR-HEARTH-010 (original discovery-scan timeout fix, the pattern this ADR extends),
ADR-HEARTH-011 (the relay's own reason for existing), ADR-HEARTH-035 (real network topology this
relay path serves), ADR-HEARTH-042 (SmartThingsClient's origin), ADR-HEARTH-045 (the Expo Go
claim corrected by this ADR's update to that document).
