# ADR-HEARTH-025: Themed on-screen keyboard for the Sony PSK field

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean: "add a keyboard tab for typing in passwords. use the structure of
the normal apple keyboard on iphones or whatever phone is loading the app
but formatted to match the app." The system keyboard's white background
breaks the dark theme every other screen in the app maintains, and it's
the one input surface Hearth doesn't control the look of at all.

Flagged one real tradeoff before building rather than after: replacing
the system keyboard means iOS's own password autofill/Keychain
suggestions no longer apply to this field. Sean's follow-up ("keep
chopping") confirmed proceeding anyway.

## Decision

New `src/ui/ThemedKeyboard.tsx` — a controlled component
(`value`, `onChange`, `onDone`) rendering:
- Three letter rows (10/9/7 keys — the same inset shape the real iOS
  keyboard has, not by design intent but because that's how many letters
  are in each QWERTY row), a shift key and backspace flanking row 3.
- A `123`/`ABC` toggle to a numbers-and-symbols page
  (`1234567890`, `-/:;()$&@"`, `.,?!'`).
- A bottom row: mode toggle, space, Done.

Wired into `AddSonyDeviceScreen.tsx`'s PSK field only — the one
password-style input in the app right now. That `TextInput` gets
`showSoftInputOnFocus={false}` (keeps normal focus/cursor/selection
behavior without popping the real keyboard) and an `onFocus` that shows
`ThemedKeyboard` beneath it; `onDone` hides it again. `secureTextEntry`
still masks the value regardless of which keyboard typed it.

Every key is flex-sized (`flex: 1`, wider keys `flex: 1.5`/`5`), not
given a fixed pixel width — the same overflow-bug class found twice
already this session (ADR-HEARTH-016, ADR-HEARTH-024) came from fixed
widths not fitting every screen; letting flexbox divide each row avoids
it here by construction rather than one more manually-computed width
that could be wrong for some device.

## Rationale

Scoped to the Sony PSK field only, not a generic "themed keyboard
everywhere" — it's the only password-style field that exists. If a
future field needs the same treatment, `ThemedKeyboard` is already a
reusable, generic controlled component (no Sony-specific knowledge in it
at all); wiring it to a second field is a few lines at that call site,
not a rearchitecture.

## Consequences

- 109/109 tests passing (no new test — this is a new interactive UI
  component with no test file by this project's established convention,
  same as every other screen in `src/ui/`), `tsc --noEmit` clean.
- **Known, accepted tradeoff**: this field no longer gets iOS's system
  password-manager/autofill suggestions, since the system keyboard never
  opens for it. Confirmed as an acceptable cost, not an oversight.
- Not yet verified in Expo Go — same outstanding caveat as every UI
  change this session. Worth Sean specifically checking that
  `showSoftInputOnFocus={false}` behaves as expected on a real device
  (this prop's behavior has had platform quirks in older RN versions;
  this project is on a recent Expo SDK, but real-device confirmation is
  still the only way to know for certain).
