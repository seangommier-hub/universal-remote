# ADR-HEARTH-215: real mouse pointer control for the LG TV, via a touchpad

## Status

Accepted

## Context

Sean, directly (2026-10-06), after Family Command Center's own dashboard was shown on the
downstairs LG TV (ADR-HEARTH-213's "Call Center" context, `open_command_center.js`): "the mouse is
not working nor keyboard."

Root cause, traced through the actual code rather than assumed: Hearth never had real pointer
control at all. `LgWebOsClient.ts`'s pointer socket only ever sent `type:button` (discrete named
key presses — `sendButton`), which move *focus* between elements, the same mechanism
`directionalNavigation`'s d-pad uses. That's fine for a TV app deliberately built remote-friendly
(a fixed, sane focus order), but a generic web dashboard isn't one of those — it expects a real
cursor that can land on any pixel, not a focus order. `textEntry`'s `insertText` only inserts into
whatever field already *has* focus — which nothing could give it on arbitrary web content without
a real click first. So "mouse" was never built, and "keyboard" could never engage without it.

This blocked the exact thing ADR-HEARTH-213 was built for (seeing and using Family Command Center
on the TV), so it's a direct continuation of that work, not a separate feature request.

## Decision

- `LgWebOsClient.ts`: `sendMove(dx, dy)` and `sendClick()`, added next to the existing
  `sendButton` — same pointer socket, same connection/auth path already proven, just two more
  webOS pointer-socket wire-format messages (`type:move`/`type:click`, documented alongside
  `type:button` in the same primary source — hobbyquaker/lgtv2 — this file already cites).
  `PAIRING_MANIFEST` already requests `CONTROL_MOUSE_AND_KEYBOARD` and always has, unused until
  now — no re-pairing needed, same situation `textEntry` was in before it existed.
- `Capability.ts`/`LgWebOsDriver.ts`: new `pointerMove` (args `{dx, dy}`) and `pointerClick`
  capabilities, LG-only (same per-brand verification standard as every other capability — Samsung's
  protocol is key-press-emulation only, Roku/Sony have no pointer-socket equivalent in either's own
  primary source).
- `useTouchpadGesture.ts` (new): a PanResponder-based touchpad gesture, same structure as
  `useDpadSwipeGesture.ts` — pure predicate (`isTouchpadTap`) extracted for direct unit testing,
  gesture wiring thin around it. Streams accumulated movement as `pointerMove` commands on a 40ms
  flush interval while dragging (not one command per raw touch-move event, which can fire dozens of
  times a second) and fires `pointerClick` on release if the whole gesture stayed within 8px of its
  start.
- `TouchpadModal.tsx` (new): a full-screen draggable surface, opened via a new "Touchpad" button in
  `UtilityActionsRow.tsx` — capability-gated (`has(device, "pointerMove")`, LG only today), unlike
  ADR-HEARTH-213's Call Command Center button which is unconditional.
- `commandVerb.ts`: `pointerMove`/`pointerClick` both added to `NAVIGATION_NOISE` — a touchpad drag
  fires `pointerMove` as often as a d-pad swipe fires `directionalNavigation`, the same noise class
  already excluded from the household activity log; `pointerClick` is grouped with `select`'s own
  treatment (a real, discrete action, but still navigation rather than a log-worthy line).

## Consequences

- The Touchpad button only appears for LG devices (the only driver declaring `pointerMove`) — Sony/
  Samsung/Roku remote screens are unaffected, both visually and in `deriveRemoteViewState.ts`'s
  utility-row column math (which now counts `pointerMove` alongside the row's other
  capability-gated items, same as every one of them).
- New test coverage: `LgWebOsClient.test.ts` (2 tests — wire format for move/click, reusing the
  existing pointer-socket connection tests already prove), `LgWebOsDriver.test.ts` (3 tests —
  command dispatch, dx/dy validation), `useTouchpadGesture.test.ts` (7 tests — the tap/drag
  predicate), `commandVerb.test.ts` (2 tests — verb text never includes raw dx/dy, noise
  classification). Full project suite: 2354/2372 passing (18 pre-existing skips, 0 failures).
- Not yet verified against the real LG TV — logic-level fix built from the same proven pointer
  socket `sendButton` already uses live, but the actual touch-feel (flush interval, tap threshold)
  needs a real finger on a real touchscreen to confirm, same honesty standard as
  `useDpadSwipeGesture.ts`'s own unverified note.
- Needs an EAS update to reach Sean's and Leah's phones before it's usable.
