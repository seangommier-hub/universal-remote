# ADR-HEARTH-117: Remove LG's press-count playback guess — it was rotating nonsensically

**Date:** 2026-09-20
**Status:** Accepted, implemented

## Context

Sean, live, on the merged `selectPlayPause` button shipped in ADR-HEARTH-114: "it just rotates
between select, play, and pause and is nonsensical. Try again."

Root cause: when `selectPlayPause` case was built by folding the old separate `playPause` case
into `select`, it carried over the pre-existing "assume playback started on the 2nd press after
launching a streaming app" heuristic (2026-09-13) — but ALSO added a new piece that heuristic never
had: every press *after* the second one unconditionally toggled the guessed `playbackState` between
playing/paused. That's wrong on its own terms, not just imperfect — a third, fourth, fifth press
could just as easily be more menu navigation (picking an episode, dismissing a dialog) as an actual
play/pause intent, and the code had no way to tell them apart. The result was exactly what Sean
saw: the button's icon mechanically cycled select → pause → play → pause → play... on every press,
regardless of what was actually happening on screen.

## Decision

Removed the entire command-history-derived playback guess from `selectPlayPause` — not tuned
again, removed. The case now does exactly one thing: `client.sendButton("ENTER")`, then
`patchValues({ lastAction: "select" })`. No `playbackState` guessing of any kind.

This also removes the `assumedInStreamingApp`/`selectPressesSinceLaunch` maps entirely (including
their reset points in `home`/`launchApp`/`inputSelection`/`disconnect`) — they existed only to
support this now-deleted heuristic.

The button's icon still reflects real `playbackState` correctly whenever it's actually known —
`subscribeToPlaybackState` (ADR-HEARTH-051)'s live push subscription is untouched and independent
of this case entirely. On webOS firmware that supports it, the icon updates live and accurately.
On Sean's specific TV (confirmed 404 on that subscription, per this driver's own longstanding
top-of-file comment), the icon now honestly stays a plain Select rather than cycling through a
guess — the same "leaving it unset is more correct than guessing wrong most of the time" principle
this driver has applied to every other unconfirmable field since 2026-09-13, now applied here too.

## Consequences

- Fixes the reported bug completely: no more press-driven rotation, ever, on any firmware.
- `home`/`inputSelection`/`launchApp` still set `playbackState: "stopped"` directly — those are
  legitimate, confident claims independent of the deleted heuristic, unchanged.
- On firmware where the real subscription works, nothing is lost — the icon was already, and
  remains, driven by real data in that case; the heuristic only ever mattered for firmware (like
  Sean's) where no real signal exists at all.
- `LgWebOsDriver.test.ts`: replaced the "command-history playback approximation" describe block
  (which explicitly tested the now-removed toggle-on-every-press behavior — including a test this
  session had written for it minutes before it was reported broken live) with tests confirming
  `selectPlayPause` never touches `playbackState`, and a dedicated regression test pressing it 4
  times in a row after `launchApp` to guard against this exact bug recurring. Added a second test
  confirming a real pushed subscription value survives a press untouched. `npx tsc --noEmit`
  clean; full suite 910/910 passing.
- This is a second real lesson (after ADR-HEARTH-068) that guessing playback intent from a
  command-history counter, rather than a real device signal, tends to fail in exactly the way this
  driver's own comments already warned about — worth remembering before adding a similar heuristic
  to any future driver.
