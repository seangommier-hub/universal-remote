# ADR-HEARTH-136: Keypad digits and digit-only text work in any app, on every device

**Date:** 2026-09-25
**Status:** Accepted, implemented and unit-tested; not yet tried against a real Netflix PIN screen

## Context

Sean: in Netflix, with a PIN to open a user's account, "the keypad doesn't function nor does the
keyboard in search functions," then: "this needs to be fixed globally."

Causes found:
1. The keypad collected digits and only sent them when Enter was pressed, as one number through
   `setChannel`. Nothing reached the TV while a PIN was being entered, the number lost leading zeros
   ("0123" became 123), and the TV saw a channel change instead of key presses.
2. LG `textEntry` uses the webOS on-screen-keyboard service (`ime/insertText`). An app with its own
   number/PIN screen (Netflix) has no webOS keyboard, so there is nothing to type into.

## Decision

- Keypad works like a physical remote on every device that has one (LG, Samsung, Roku): each digit is
  sent the instant it is pressed as `setChannel` with a new `digits` arg (one raw key press, no
  channel-change claim, leading zeros preserved via `sendDigitSequence` now accepting a digit string).
  The on-screen number is only an echo. Enter presses the device's select/OK key (LG and Roku merged
  select+play/pause, Samsung select). The old collect-then-send flow is removed, not kept alongside.
- LG `textEntry` of only digits goes out as real remote key presses instead of IME insertText, so a PIN
  typed on the Keyboard tab works. Roku (literal key presses) and Apple TV already type this way.

## Known limit

Letters typed in an app with its own custom on-screen keyboard that has no webOS text field (LG
Netflix search) still cannot be typed: LG's API has no letter key presses. That needs d-pad navigation
of the app's own keyboard; not solvable from text entry.

## Consequences

- Any channel typed on the keypad now needs Enter (select/OK) to commit, the same as a real remote.
- Tests added: leading zeros and non-digit rejection in `sendDigitSequence`; LG keypad digit and
  digit-only text entry over the pointer socket.
