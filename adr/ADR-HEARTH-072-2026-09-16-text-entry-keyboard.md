# ADR-HEARTH-072: On-screen keyboard tab for typing usernames/passwords onto the TV

**Date:** 2026-09-16
**Status:** Accepted, implemented; not yet live-verified against real hardware

## Context

Sean, directly: "add a keyboard so that the user can type usernames and passwords rather than
having to navigate to each letter on screen, put this as an additional tab like the keypad."

## Design decision: relay the phone's own keyboard, don't rebuild an on-screen QWERTY grid

The real pain point is navigating a TV's on-screen keyboard one letter at a time with a d-pad. The
fix isn't a custom on-screen letter grid inside Hearth (redundant with what the TV already shows,
and worse than the phone's own keyboard — no autocorrect toggle, no symbol layer, more taps). A
plain `TextInput`, using the phone's own native keyboard, that relays the finished string to the TV
in one action is strictly better UX and far less to build. This mirrors this project's existing
`setChannel` numeric-keypad pattern (type on the phone, send the result) rather than the TV's own
UI paradigm.

## Research: verified per-brand before declaring the capability, not assumed

- **Roku**: real, declared. Official ECP docs document `POST /keypress/Lit_<char>` — sends one
  literal printable character to whichever on-screen field has focus. No single-shot "insert this
  whole string" call exists, so a full string is sent as a sequence of per-character requests
  (`sendCharacterSequence.ts`, the general-purpose sibling of the existing `sendDigitSequence.ts`).
  Each character is `encodeURIComponent`-escaped before going into the URL path segment — a real
  finding from earlier research this session: an unescaped space or other reserved character would
  corrupt the request.
- **LG webOS**: real, declared, sourced from LG's own official "Connect SDK" (2014, LG
  Electronics), adopted verbatim by the openHAB LG webOS binding
  (`LGWebOSTVKeyboardInput.java`, fetched and read directly) —
  `ssap://com.webos.service.ime/insertText` takes the entire string in one request
  (`{text, replace: 0}`), a strictly better mechanism than Roku's per-character one. Notably,
  `LgWebOsClient.ts`'s own `PAIRING_MANIFEST` has requested the `CONTROL_INPUT_TEXT` permission
  since it was first written — unused until now.
- **Samsung Tizen**: NOT declared. The unencrypted remote-control WebSocket this driver is
  restricted to (ADR-HEARTH-005) is documented key-press emulation only — no IME/text-injection
  service exists on this channel in any source checked.
- **Sony BRAVIA**: NOT declared. IRCC-IP (ADR-HEARTH-071, added the same night) only ever sends
  discrete named remote-button codes — no literal-character or string-insertion code exists in
  either primary source that driver's code table was verified against.

## What was built

- New `"textEntry"` capability (`Capability.ts`), documented with the full per-brand citation
  above.
- `sendCharacterSequence.ts` — general-purpose text version of the existing digit-sequence helper.
- `RokuEcpDriver.ts` / `LgWebOsDriver.ts` extended with the `textEntry` case each.
- `UniversalTvRemote.tsx`: a new "Keyboard" tab, shown alongside "Remote" and "Keypad" (only when
  the device declares the relevant capability, same pattern as the existing Keypad tab) — a
  `TextInput` (`autoCapitalize="none"`, `autoCorrect={false}`, since exact strings matter for
  usernames/passwords) plus a "Send" button that fires the whole current string as one `textEntry`
  command, then clears the field for the next one. A hint line tells the user to use the Remote
  tab's Select button to move to the next field or submit, since typing text and confirming/
  submitting a form are two different actions on both supported protocols.

## Verification

Full suite: 31 suites / 310 tests pass (7 new: 3 Roku, 2 LG, plus Sony's own from the same-night
IRCC-IP work), `tsc --noEmit` clean. **Not live-verified against a real device** — no Roku or LG
real-hardware checkpoint was active this session; flagged honestly rather than claimed as
confirmed, consistent with this project's standing discipline.

## Consequences

- A household with a Roku or LG TV can now type a Netflix/streaming-service password without
  d-pad-navigating an on-screen keyboard letter by letter — directly resolves the reported pain
  point.
- Samsung and Sony households don't get this capability; no code path silently pretends otherwise.
- The "Send" action inserts/types text only — it does not itself submit a form or move focus.
  That's a deliberate scope boundary (see Design decision above), not an oversight.

## Update 2026-09-16 (later): two visual-consistency fixes

Sean: "that works, but make sure the visual is consistent with the rest of the app." Two real gaps
found on review, not cosmetic nitpicks:

1. **The "Send" button was invisible text, not just visually off** — passed both `icon` and
   `label` to `CapabilityButton`, which (per this codebase's own established rule, first found and
   fixed 2026-09-10 on the Reconnect button) never renders both together — icon suppresses the
   label entirely. The button was silently rendering as a bare arrow glyph with no visible "Send"
   text at all, the identical bug class already documented and fixed multiple times elsewhere in
   this app. Fixed by dropping the icon, matching every other named pill action button.
2. **The hint copy was plain floating text**, not matching this app's established pattern for
   neutral informational callouts (`addDeviceFormStyles.ts`'s `hintCard`/`hint`, used across every
   Add*DeviceScreen — a bordered, subtly-backgrounded box, not bare paragraph text). Added a local
   `keyboardHintCard` style using this file's own existing token choices (the same `surfaceRaised`
   "raised element against a `surface` card" pattern `CapabilityButton`'s own default button
   background already establishes) rather than importing the Add-screen-specific style file.

Full suite (31/310) and `tsc --noEmit` still clean after both fixes.
