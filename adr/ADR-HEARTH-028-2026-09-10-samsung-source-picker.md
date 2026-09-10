# ADR-HEARTH-028: Samsung source picker (openSourceList)

**Date:** 2026-09-10
**Status:** Accepted

## Context

ADR-HEARTH-027 flagged Samsung's `KEY_SOURCE` as a known, deliberately
unimplemented gap — a different mechanism from `inputSelection` (opens a
picker vs. switches to a resolved input id), left for its own ADR rather
than forced into that capability. Picked up proactively while continuing
this session's "think about all the things on the remote" sweep.

Verified `KEY_SOURCE` is real before using it: confirmed in the same
documented Tizen key-code reference this driver already cites elsewhere
("KEY_SOURCE|Source", listed under Input Keys).

## Decision

New capability `openSourceList`, Samsung-only. `keyCodeFor()` maps it to
`KEY_SOURCE` — sent exactly like every other Samsung key press, no new
mechanism needed in the client. `UniversalTvRemote.tsx`'s utility row
gains a "Source" chip (`tv-outline` icon) alongside Settings/Sleep,
gated on `has(device, "openSourceList")`.

No new UI beyond the single button — pressing it opens the TV's own
on-screen source list, which the user then navigates with
`directionalNavigation`/`select`, both of which this driver already
implements. Nothing further to build for this to be a complete, working
feature.

## Rationale

Kept deliberately separate from `inputSelection` rather than reusing that
capability id for a "different enough" mechanism — see ADR-HEARTH-027's
own reasoning for why. A UI that rendered a list of specific inputs
(HDMI1/HDMI2/...) for `openSourceList` the way `inputSelection` does
would be actively misleading here: pressing any of those buttons would
just resend the same `KEY_SOURCE` regardless of which one was tapped,
since Samsung's protocol has no way to jump to a specific input directly.

## Consequences

- 112/112 tests passing (1 new, confirming the exact `KEY_SOURCE` code is
  sent), `tsc --noEmit` clean.
- Not yet verified on a real Samsung TV — Sean's testing this session has
  been LG-only.
