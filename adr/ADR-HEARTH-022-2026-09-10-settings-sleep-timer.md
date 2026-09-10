# ADR-HEARTH-022: Settings and Sleep Timer — Samsung only, verified per-protocol

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean asked for Settings and Sleep Timer buttons, positioned next to each
other. Rather than add a button to every driver and have some of them do
nothing real, checked each protocol's own documented capability first:

- **Samsung Tizen** (the remote-control key-code protocol this driver
  already uses): the documented key list includes `KEY_SLEEP`
  ("SleepTimer") and `KEY_TOOLS` (opens the TV's quick-settings panel) —
  both real, separate, already-reachable through the exact same
  `sendKey()` mechanism every other Samsung capability uses.
- **LG webOS SSAP**: the reference implementation this driver is already
  verified against (`hobbyquaker/lgtv2`) explicitly states that
  "endpoints not listed here (picture settings, energy saving, …) are not
  exposed through the SSAP permission set of this pairing manifest." No
  sleep-timer or settings endpoint exists in the public API surface this
  app can reach.
- **Roku ECP**: the official documented key list (Home, Rev, Fwd, Play,
  Select, Left, Right, Down, Back, InstantReplay, Info, Backspace,
  Search, Enter, plus the optional FindRemote/Volume*/Power/Channel*/
  Input* keys) has no sleep or settings key at all.
- **Sony BRAVIA REST API**: inconclusive from available documentation —
  found no confirmed sleep-timer method, but also couldn't rule one out
  without querying `getMethodTypes` against a real device. Not
  implemented; not asserted either way.

## Decision

Added `"settings"` and `"sleepTimer"` to `CapabilityId`. Only
`SamsungTizenDriver` declares them, mapped to the verified real key codes
(`KEY_TOOLS`, `KEY_SLEEP`) in `keyCodeFor()`. LG, Roku, and Sony declare
neither — not an oversight, a direct consequence of what was actually
verified above.

`UniversalTvRemote.tsx`'s utility row renders Settings and Sleep Timer
immediately adjacent, after Menu, matching "next to each other" literally
— both gated on `has(device, ...)` like every other capability-driven
control on this screen, so they simply don't appear for a device whose
driver doesn't declare them.

## Rationale

This session already has one hard-won lesson about not shipping an
unfounded claim (the earlier LG ThinQ section-ordering research that
couldn't be backed by a primary source, and was explicitly not acted on
for that reason). Fabricating a Settings/Sleep button that silently does
nothing — or errors — on three of four drivers would be the same mistake
in a different shape. Verifying per-protocol first, and shipping only
where verified, is slower than adding one generic button everywhere, but
it's the only version of this that's actually true.

## Consequences

- 103/103 tests passing (1 new, `SamsungTizenDriver.test.ts`, confirming
  the exact key codes sent), `tsc --noEmit` clean.
- If Sony's REST API turns out to have a real sleep-timer method, that's
  a follow-up ADR once actually confirmed (e.g. by querying
  `getMethodTypes` against a real Sony TV) — not retrofitted here on a
  guess.
- Not yet verified on Sean's real Samsung TV (his testing this session
  has been LG-only) — next checkpoint is pairing a Samsung device and
  confirming both keys do what the documentation says.
