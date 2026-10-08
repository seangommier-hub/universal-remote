# ADR-HEARTH-220: the Keyboard tab is Hearth's own on-screen keyboard, one key per tap

## Status

Accepted. Not yet verified against Netflix/YouTube search on a real TV (see Consequences).

## Context

Sean (2026-10-08): the Keyboard tab "still isn't working for search functions like the keypad
does," and "no longer leverage the apple keyboard and do similar as the keypad."

The old tab typed into the phone's keyboard and sent the finished string as one `textEntry`
(LG: `ssap://com.webos.service.ime/insertText`). Probed against the downstairs LG with Netflix in
front: the TV answers `returnValue: true` to `insertText` and `sendEnterKey` even when no field is
waiting for text, so Hearth never saw a failure; and a subscription to
`registerRemoteKeyboard` reported no focused field (the call itself requires a subscription).
Netflix draws its own keyboard rather than using webOS's text service, so there is nothing for
`insertText` to type into. The Keypad tab works there because each digit is a real remote key
press delivered immediately (ADR-HEARTH-136).

## Decision

- No `TextInput` and no OS keyboard. `KeyboardCard.tsx` is a QWERTY on-screen keyboard
  (`onScreenKeyboard.ts` holds the pure layouts: number row, letters with one-shot shift, a symbols
  layer, space, delete, enter).
- Every key is sent to the TV the moment it is tapped, one `textEntry` per character, mirroring the
  Keypad tab. Delete sends `textEntry` with `{ backspace: true }`: LG `ssap://com.webos.service.ime/deleteCharacters`
  (`count: 1`), Roku ECP's `Backspace` key. Enter reuses the Keypad tab's Enter (select/OK).
- A local echo line shows the last 28 typed characters; the TV holds the real text.
- Sizes use the remote's shared scale (ADR-HEARTH-219), so the keyboard fits one screen on every
  device size; `remote-lg-keyboard` passes the no-scroll check at 375x667, 393x852 and 430x932.
- The household activity log already collapses repeated identical actions, so typing a word is one
  "typed text" line, never the letters.

## Consequences

- Fields that use the TV's own text service (LG apps and the TV browser, Roku fields) now get text
  as you type, with working delete.
- **Open limit:** an app that draws its own keyboard and exposes no text field (Netflix, YouTube on
  LG) may still ignore letters; webOS has no letter key buttons to send. If a real-TV test shows
  that, the next step is typing by driving that app's on-screen keyboard with the d-pad, or
  launching YouTube with the search term as a launch parameter.
- Tests: `onScreenKeyboard.test.ts` (6), LG and Roku driver tests for backspace/single characters.
