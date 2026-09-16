# ADR-HEARTH-070: Haptic feedback on every remote-control button press

**Date:** 2026-09-16
**Status:** Accepted, implemented

## Context

Sean: "add slight haptic feedback, when clicking around the app to make the user get the feel like
they are using an actual remote when navigating on a tv like a real remote when clicking a button
and push out."

## Decision

Added `expo-haptics` (SDK-57-pinned via `npx expo install`) and fired one `Light` impact haptic the
instant a press begins, at the single shared choke point almost every button in the app already
goes through: `CapabilityButton.tsx` (the d-pad, rockers, keypad, power/play-pause/select, every
`UtilityAction` — Home/Menu/Mute/Back/Settings/Sleep/Source — since that component itself renders
a `CapabilityButton` internally) plus `StreamingAppTile` in `UniversalTvRemote.tsx` (the Netflix/
Hulu/Prime/YouTube launch tiles), the one remote-screen control that renders a raw `Pressable`
instead of going through `CapabilityButton`. `fireHapticClick()` is exported from
`CapabilityButton.tsx` specifically so that second call site reuses the same function rather than
duplicating the haptic call.

Two deliberate judgment calls, not directly specified by the ask:

1. **`onPressIn`, not `onPress`.** `onPress` only fires on release inside the button's bounds —
   noticeably delayed compared to a real remote button's immediate tactile response the instant you
   press it. `onPressIn` fires the moment the touch begins, matching that immediacy.
2. **One pulse per tap, not a second one on release.** Sean's phrasing ("push and push out") could
   be read as wanting two distinct haptic events. Tried and rejected: two haptics for a single tap
   reads as a buzz/glitch, not a "click down, click up" feel — there's no real device this reads as
   premium on. A real remote button's tactile feel comes from its own mechanical travel, which a
   single, immediate pulse approximates far better than a doubled one. Flagging this explicitly
   since it's a real interpretation choice, not the only reasonable one.

Scoped to the actual remote-control surface (`CapabilityButton`/`StreamingAppTile`) rather than
every `Pressable` in the app (device-list cards, Add Device tiles, scene chips, tab switches) —
"navigating on a tv like a real remote" is specifically about the remote screen's own controls, and
haptics on unrelated list/navigation chrome would read as generic app-wide buzzing rather than a
deliberate remote-feel choice.

Wrapped in `.catch(() => {})` — `expo-haptics` can throw on a simulator or a device with no real
vibration hardware, and a cosmetic feature must never be able to break a real button press.

## Verification

Full suite: 30 suites / 297 tests pass, `tsc --noEmit` clean. Not yet felt on a real device — this
is inherently something only physical hardware can confirm (an emulator/simulator has no haptic
motor), so "does this actually feel right" is Sean's own call the next time he's on his phone, not
something verifiable from this session.

## Consequences

- Every future button added via `CapabilityButton` gets this for free, with zero extra wiring —
  the intended payoff of putting it at the shared component rather than each call site.
- If Sean wants haptics on other tappable surfaces (device cards, Add Device tiles, scenes) later,
  that's a deliberate scope expansion to ask for, not something this change silently extended to.
