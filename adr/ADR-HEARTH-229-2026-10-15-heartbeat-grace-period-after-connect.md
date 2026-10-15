# ADR-HEARTH-229: The connection heartbeat gets a grace period right after connecting

## Status

Accepted

## Context

Sean, directly (2026-10-15): "it was working fine up until i went on my work trip... it's odd that
i can wake it up by turning it on but then it drops the connection." Asked to check memory rather
than re-theorize from scratch — the right call, since the shape of the bug (connects, then drops,
specifically after a cold wake, never seen during ordinary daily use before an extended trip) was
the real clue.

Tracing it: LG is the only driver with a connection heartbeat (`connectionHeartbeat.ts`,
ADR-HEARTH-132) — Samsung and Sony don't have this mechanism at all, so this was never going to
explain their TVs' separate issues. The heartbeat probes `ssap://audio/getVolume` every 8s and
tears the connection down as dead after 2 consecutive failures (~16s). The SSAP `register`
handshake that completes `connect()` only proves the TV's pairing/security service is up — not
that every other subsystem (audio included) has finished initializing. A TV cold-waking from deep
standby, the exact state ADR-HEARTH-227 established these TVs fall into after sitting untouched,
plausibly answers pairing before its audio service is ready, so the heartbeat's own liveness probe
can genuinely fail for the first several seconds of a brand-new connection — tearing it down as
"dead" while the TV is still finishing booting, not because anything is actually wrong.

This never showed up during ordinary use before the trip because the TV was presumably rarely, if
ever, idle long enough to reach deep standby — every prior connect was to an already-fully-awake
TV, where the heartbeat's first probe had no reason to fail.

## Decision

`startConnectionHeartbeat` takes an optional `graceMs` (default `0`, i.e. every existing caller's
behavior is unchanged). A failure within `graceMs` of the heartbeat starting is tolerated — not
counted toward the death threshold — rather than treated as a sign the connection actually died. A
success at any point still resets the count immediately, exactly as before. Once `graceMs` has
elapsed, a genuinely dead connection is torn down exactly as it always was.

LG's own heartbeat start call now passes `HEARTBEAT_POST_CONNECT_GRACE_MS = 30000` — a generous but
bounded allowance for a TV to finish booting after a cold wake, chosen as the same order of
magnitude as `WAKE_BURST_WINDOW_MS` (60s) already established elsewhere in this codebase for "how
long a TV might reasonably take to come up."

## Consequences

- A TV woken from deep standby now gets a real chance to finish booting before Hearth's own
  heartbeat can tear the brand-new connection back down — directly closes "wakes, connects, then
  drops" for the LG.
- A connection that's actually dead within that first 30 seconds (the TV answered pairing once and
  then genuinely vanished) now takes up to 30s longer to be noticed than before this ADR — an
  accepted tradeoff against the alternative of repeatedly killing TVs that were only ever slow to
  finish waking.
- Samsung and Sony are unaffected — neither has this heartbeat mechanism at all.
- New tests: `connectionHeartbeat.test.ts` (+4, covering tolerated-within-grace, counted-after-
  grace, success-still-resets, and the default-unchanged case). Full suite: 2507 passed (4 new),
  `tsc` clean.
- Needs an EAS update to reach the phones.
