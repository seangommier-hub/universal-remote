# ADR-HEARTH-077: Reconnect banner reframed to communicate ongoing background persistence

**Date:** 2026-09-17
**Status:** Accepted, implemented

## Context

Sean, after watching a throwaway diagnostic script (not Hearth itself) hit a 30-second timeout
while waiting on a real LG TV's pairing prompt: "reminder that this should act like a normal
remote would so it needs to feel natural, act natural, persist and not timeout, it should be on
demand for the user."

## Investigation before changing anything

Checked whether Hearth's own reconnect architecture actually violates this principle, rather than
assuming it did. It doesn't, structurally: every driver retries indefinitely in the background
whenever disconnected (ADR-HEARTH-017's per-driver exponential backoff, capped at a 30s interval
but never capped in total attempt count), `UniversalTvRemote.tsx` already auto-attempts a
reconnect the instant its screen opens, and both the `AppState` listener (foreground) and the new
`Network` listener (ADR-HEARTH-075, network change) trigger the same persistent retry — the user
never has to notice a drop and manually act for reconnection to eventually happen.

**The real gap was the copy, not the architecture.** The disconnected banner said "Not connected" /
"Controls are disabled until this reconnects" — language that reads as a dead end requiring the
user's action, when the actual, true behavior the whole time that banner is showing is: the device
is being retried automatically, right now, in the background, regardless of whether anyone taps
anything.

## Decision

Reframed the banner to state what's actually happening: title "Reconnecting…" (accurate for the
entire time the banner shows, not just mid-attempt, since a background retry is always in flight
or imminent per ADR-HEARTH-017's loop), body communicates both real facts together — controls are
genuinely off right now, AND retry is already happening automatically — rather than only the
first. A real error, when there is one, is still shown (never hidden), reframed as "last attempt's
outcome" rather than a final, stuck state. The button is relabeled "Try Now" (an optional
accelerant — skip waiting for the backoff timer) rather than "Reconnect" (which implied the user's
tap was what makes reconnection happen at all).

## Verification

Full suite: 34 suites / 350 tests pass unchanged (copy-only change, no new logic), `tsc --noEmit`
clean.

## Consequences

- The banner now honestly represents what's actually true the entire time it's showing, instead of
  reading as broken/stuck.
- No behavior changed — this is purely bringing the UI's language in line with logic that was
  already correct.
- Documented for future sessions: a throwaway verification/diagnostic script (like the one that
  prompted this) is explicitly NOT held to this "never times out" bar — only Hearth's own product
  UX is. See memory `feedback-remote-should-feel-natural` for the full scope note.
