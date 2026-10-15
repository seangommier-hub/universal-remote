# ADR-HEARTH-230: Sony's own "Display Is Turned off" error wakes the TV, on any command

## Status

Accepted

## Context

Sean, directly (2026-10-15): "all tv and device types should be separate and made to their needs."
Said while diagnosing the Sony Den TV's own "connects and then breaks" symptom, logged live as
`Sony BRAVIA API error 40005: Display Is Turned off`.

That error is Sony's REST API volunteering its real power state directly — the API answered, so
the TV is genuinely reachable, but the screen itself is off. This is a materially better, more
specific signal than LG's opaque connection timeouts, which say nothing about *why* a TV didn't
answer. `isReachabilityFailure` (ADR-HEARTH-102) deliberately excludes every `SonyBraviaApiError`
from the generic Wake-on-LAN fallback, for good reason — most API errors (a rejected PSK, a bad
parameter) mean the TV is on and genuinely rejecting the request, where auto-waking would be
wrong. But that blanket exclusion also swallowed this one specific, unambiguous code: pressing
anything other than the "power" capability while the Sony reported 40005 did nothing but fail —
no automatic recovery at all, for the one error Sony hands us that says exactly what to do.

(Separately, `refreshState`'s own background reconnect polling already auto-wakes on *any* failure
as of ADR-HEARTH-227, 40005 included — that path was already covered. This ADR closes the gap in
`executeCommand`'s own catch, which only auto-woke for the dedicated "power" capability's existing
unreachable-fallback, not for 40005 specifically, and not for any other capability at all.)

## Decision

`isDisplayOffError(err)` checks specifically for `SonyBraviaApiError` with code `40005` — narrower
than, and checked before, the existing blanket `SonyBraviaApiError` exclusion, which is otherwise
left exactly as it was (every other Sony API error code still surfaces as a real failure, no wake
attempted, same reasoning ADR-HEARTH-102 already gives). On this one code, `executeCommand` sends
Wake-on-LAN and starts the wake burst regardless of which capability was being attempted, then
still throws the original error — the command genuinely didn't go through, and this says so
honestly rather than faking success.

## Consequences

- Any command sent to a Sony TV whose screen is off now wakes it, not just the dedicated Power
  button — directly closes the Den TV's "connects and then breaks" pattern for Sony specifically.
- Every other Sony API error (wrong PSK, rejected parameter) is unaffected — still surfaces as a
  real failure with no wake attempted, exactly as ADR-HEARTH-102 intended.
- This is Sony-specific by design, per Sean's own framing: LG's and Samsung's TVs don't have an
  equivalent documented "screen is off but the API answered" signal, so there's nothing analogous
  to add there — each brand's own real, observed failure mode gets its own specific handling
  instead of being forced through one shared heuristic.
- New tests: `SonyBraviaDriver.test.ts` (+3: wakes on 40005 regardless of capability, a different
  error code does not wake). Full suite: 2510 passed (3 new), `tsc` clean.
- Needs an EAS update to reach the phones.
