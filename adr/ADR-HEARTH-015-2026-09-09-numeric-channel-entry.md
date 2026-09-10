# ADR-HEARTH-015: Numeric channel entry via `setChannel`, sourced per-protocol

**Date:** 2026-09-09
**Status:** Accepted

## Context

Sean: "clean up the app, make it look more like a remote, add the number
features... make sure all buttons and their borders don't overlap any other
item. make it look professional." A number pad is one of the most basic
things a "remote" is expected to have, and this project had none — a real
gap, not a nice-to-have.

`CapabilityId` already reserved a `"setChannel"` id (added when the type
was first designed, unused ever since) — exactly the right fit, so this
wires it up rather than inventing a redundant new capability.

## Decision

Implemented `setChannel` for the three drivers where real support could be
sourced and verified — **not** all four:

- **LG webOS**: digit button names are literal `"0"`..`"9"`, confirmed
  against `hobbyquaker/lgtv2`'s own README (the same reference this
  project's whole LG protocol implementation is sourced from) — sent over
  the existing pointer-input socket, the same path every other LG button
  press already uses.
- **Samsung Tizen**: `KEY_0`..`KEY_9`, confirmed against
  `xchwarze/samsung-tv-ws-api`'s `COMMANDS.md` "Number Keys" section — sent
  via the existing `sendKey()` path.
- **Roku (ECP)**: `Lit_0`..`Lit_9` — Roku's own official ECP documentation
  describes `Lit_<char>` as sending a literal printable character; digits
  follow the identical convention. Sent via the existing `keypress()` path.
- **Sony BRAVIA**: **not implemented.** Sony's driver has no button-press
  capability of any kind yet — `directionalNavigation`/`back`/`home`/`menu`
  were already explicitly deferred in ADR-HEARTH-004 pending IRCC-IP
  research, a separate protocol from the REST API this driver currently
  uses for power/volume/input. Adding digit entry would mean implementing
  IRCC-IP from scratch — genuinely new protocol work, not "wire up an
  existing path" like the other three. Scoped out rather than built
  speculatively/unverified; tracked as part of the same still-open
  IRCC-IP follow-up in `ROADMAP.md`.

None of these protocols expose a single "set channel to N" call — every one
requires sending the target channel as a sequence of individual digit key
presses, which the device itself accumulates into a channel number over a
short window (the same mechanism a physical remote's number pad relies on).
Extracted the shared "press each digit with a short delay between presses"
logic into `src/core/util/sendDigitSequence.ts` — genuinely identical logic
across all three drivers (loop over digits, delay, invoke a driver-specific
press function), not speculative sharing.

UI: `UniversalTvRemote` gets a new card (gated on `has(device, "setChannel")`)
with a 0-9 keypad, a running digit display, Clear, and Enter — digits
accumulate in local component state and are sent as one `setChannel` call
on Enter, capped at 4 digits (no real broadcast channel needs more; guards
against a runaway sequence being sent to the device).

## A real bug found along the way

`CapabilityButton`'s `shape="circle"` variant only ever rendered an icon,
never label text (by design, for the icon-only d-pad). A plain digit button
has no icon — it would have rendered as an empty circle. Fixed by
rendering the label as text whenever no icon is given, regardless of shape
— every existing `circle` call site already passes an icon, so this is
additive, not a behavior change for anything that exists today.

## Consequences

- 87/87 tests passing (12 new: `sendDigitSequence.test.ts` plus
  `setChannel` coverage in all three drivers' own test files), clean
  `tsc --noEmit`.
- `row`'s flex style gained `flexWrap: "wrap"` as a defensive measure per
  Sean's "buttons... don't overlap" requirement — button rows now wrap
  instead of overflowing on narrow screens or longer label sets, rather
  than relying on every row happening to fit exactly.
- If Sony's IRCC-IP work ever happens, `setChannel` should be added there
  too using the same `sendDigitSequence` helper — not a new pattern.
