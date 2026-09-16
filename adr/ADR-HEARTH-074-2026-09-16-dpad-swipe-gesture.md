# ADR-HEARTH-074: Swipe-to-navigate on the d-pad, layered on top of the existing arrow buttons

**Date:** 2026-09-16
**Status:** Accepted, implemented; not yet live-verified against real hardware

## Context

Continuation of the same-day, three-agent research pass (ADR-HEARTH-073) — this ADR covers the
next item from that research: Apple TV Remote's most distinguishing feature, a swipe-based
touchpad for d-pad navigation, confirmed via Apple's own support docs (support.apple.com/
en-us/102337) and independent writeups (cultofmac.com).

## Design decision: additive, not a replacement

The real Siri Remote has one unified circular clickpad with no separate discrete arrow buttons —
press vs. swipe is disambiguated entirely by gesture. Hearth's d-pad is a different, pre-existing
design language (four separate arrow buttons plus a center Select button, ADR-HEARTH-016). Ripping
those out in favor of gesture-only would be a materially bigger, riskier redesign than what the
research actually called for. Instead, swipe-to-navigate is layered on top of the same circular
hub as an *additional* input method — tap the arrows exactly as before, or swipe anywhere in the
same area, both drive the identical `directionalNavigation` capability.

## What was built

- `useDpadSwipeGesture.ts` — same tool and testable-predicate structure as the existing
  `useSwipeBackGesture.ts` (React Native's built-in `PanResponder`, zero new dependency; pure
  `shouldClaimDpadSwipe`/`resolveSwipeDirection` functions extracted for direct unit testing
  rather than only reachable through a live gesture simulation). A swipe only registers once
  movement clearly exceeds a 36px threshold in a dominant axis — a genuinely diagonal drag (the
  two axes within 15% of each other) is treated as ambiguous and ignored rather than guessing
  which direction was meant.
- Wired onto the same `View` that already contains the d-pad's arrow buttons in
  `UniversalTvRemote.tsx`. A completed swipe fires the same `send("directionalNavigation",
  {direction})` path a button tap already does, plus the same `fireHapticClick()` haptic feedback
  (ADR-HEARTH-070) — swiping should feel like pressing, not like a different, unfeedback'd
  interaction.
- Gated on `controlsDisabled` the same way every button already is.

## Verification

12 new tests (`useDpadSwipeGesture.test.ts`) cover the threshold boundary, all four directions,
the ambiguous-diagonal case, and dominant-axis resolution when both axes clear the threshold. Full
suite: 32 suites / 326 tests pass, `tsc --noEmit` clean.

**Not verified end-to-end against a real device or emulator** — none was available this session.
Specifically unconfirmed: whether the 36px movement threshold is generous enough to never
intercept a deliberate tap on one of the d-pad's own arrow buttons sitting inside the same
swipeable area — this is the same class of platform-level uncertainty
`useSwipeBackGesture.ts`/`.test.ts` already documented for their own gesture (that one hit a real,
confirmed Android system-gesture conflict; this one's risk is different — button-tap interference,
not an OS-level intercept — and is simply unverified either way). If real-device testing finds
taps getting swallowed, raise `MOVEMENT_THRESHOLD` first before assuming the gesture layer itself
is wrong.

## Consequences

- Households with an LG, Samsung, Roku, or Sony device (any driver declaring
  `directionalNavigation`) get an additional, faster way to navigate without reaching for
  individual arrow taps — purely additive, no existing behavior changed for anyone who doesn't use
  it.
- No driver-side changes were needed — this dispatches through the exact same capability every
  arrow button already uses.
- The remaining items from ADR-HEARTH-073's research (recent-apps row, Wi-Fi-switch reconnect
  hardening, configurable Scene delays, separate on/off Scene sequences) are still open backlog,
  unchanged by this ADR.
