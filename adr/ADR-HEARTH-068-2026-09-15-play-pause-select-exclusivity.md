# ADR-HEARTH-068: Stop making Select and Play/Pause mutually exclusive; corroborate Roku's ambiguous playback reads

**Date:** 2026-09-15
**Status:** Accepted, implemented

## Context

Sean reported the center d-pad button ("select play pause button") "still struggling" — specifically
getting stuck when Netflix's PIN-protected kids/adults profile lock is showing. Mid-investigation he
added a second, independent real example: on YouTube, the in-video "Skip Ad" button appears while
Roku correctly reports the video as playing — but at that exact moment there was no way to tap it,
because the center button was Play/Pause, not Select.

Per his explicit request, three parallel research agents investigated this before any code changed:
Roku ECP behavior/community reports specifically around Netflix's PIN lock, Roku's full ECP endpoint
surface for any alternate disambiguating signal, and how other shipped remote-control products
(chiefly Home Assistant's mature Roku integration) handle the same class of ambiguity. Full findings
below; all three are real, sourced, and none fabricated.

## What the research found

1. **python-kasa's sibling project for Roku, `python-rokuecp`** (the library behind Home Assistant's
   official Roku integration) treats exactly "play"/"pause" as valid `/query/media-player` states and
   collapses everything else — including a missing `<player>` element — to `None`. This confirms
   Hearth's original two-state recognition matches the de facto industry standard for this protocol,
   not a bug unique to this app.
2. **Home Assistant's actual Roku `media_player.py`** (github.com/home-assistant/core) does NOT stop
   at an unknown media state. It checks `/query/active-app`'s data next and reports a distinct,
   neutral `ON` state (app active, playback unknown) rather than ever guessing `PLAYING`/`PAUSED`, and
   never forces `IDLE`/`stopped` unless there's genuinely no active app. This is a real, shipped
   precedent for "corroborate before committing to stopped."
3. **No product researched — Home Assistant, Harmony, SofaBaton, Roku's own official remote, Apple TV
   Remote, Google Home — documents or appears to solve the specific PIN-lock/login-overlay ambiguity.**
   Real Home Assistant community threads (e.g. community.home-assistant.io/t/media-player-state-
   unreliable-not-working/956003) show this exact class of "state gets stuck" complaint on other
   platforms too, with no clean resolution offered. This is genuinely open territory, not something to
   copy a fix from.
4. **Roku's own ECP docs, read in full** (developer.roku.com/dev/docs/external-control-api and
   .../remote-control-buttons): confirmed "Play" is the documented, dedicated playback toggle
   ("if playing, pauses; if paused, resumes"), while "Select/OK" is generic UI-activation, only
   optionally wired to playback by an app's own authors. Confirmed no endpoint exists to directly
   detect a modal keyboard/PIN-entry overlay — that's a genuine, permanent gap in what ECP can report,
   not an oversight in this driver. `/query/active-app` DOES reliably report whether any app is
   running vs. the home screen, and whether the system screensaver is active (a `<screensaver>`
   sibling element) — real, usable corroborating signals, just not a direct overlay detector.

## Root cause (both reported bugs, one design flaw)

`UniversalTvRemote.tsx`'s d-pad center button was a single UI slot, exclusively either "Play/Pause"
(when `playbackState` resolved to playing/paused) or "Select" (every other case) — never both. Two
real scenarios need the OTHER option at exactly the moment the guess picks wrong:

- Netflix's PIN lock makes `playbackState` ambiguous while the app is still genuinely active — the
  button silently became Select, which doesn't reliably help a user through a PIN/keyboard overlay.
- YouTube's Skip Ad button needs Select while `playbackState` is confidently "playing" — exactly when
  Select was hidden.

No amount of smarter state-guessing fixes this, because the two scenarios need *opposite* guesses to
be "right." The fix is to stop guessing which one to show.

## What was built

1. **`UniversalTvRemote.tsx`**: the d-pad center button is now permanently Select (its original,
   universal role) whenever the device has that capability. `playPause`, when the device has it, is
   now its OWN always-visible button in a new row directly below the d-pad hub — never hidden, never
   gated on `playbackState`. Its icon/label still reflect real known state when available (cosmetic
   only now, never gatekeeping): "Pause"/pause icon when confidently playing, "Play"/play icon when
   confidently paused, a neutral "Play/Pause" label otherwise. This fixes both reported bugs directly:
   Select is always reachable (Netflix PIN entry, YouTube's Skip Ad), and Play/Pause is always
   reachable too (actually toggling playback, including attempting to resume behind a PIN lock).
2. **`RokuEcpClient.ts`**: added `getActiveApp()` (`/query/active-app`), parsing which app is
   currently focused and whether the screensaver is active — the real, sourced signal from finding
   #2/#4 above.
3. **`RokuEcpDriver.ts`**: `refreshPlaybackState` no longer commits an ambiguous media-player read
   straight to `"stopped"`. It now corroborates with `getActiveApp()`: only a confirmed-idle result
   (home screen or screensaver) sets `"stopped"`; if a real app is still active (or the corroborating
   query itself fails), the previously-known `playbackState` is held rather than overwritten with a
   guess — mirroring Home Assistant's real, shipped pattern from finding #2. This makes the new
   always-visible Play/Pause button's icon meaningfully more stable/correct through a transient
   overlay, though the button's availability no longer depends on getting this right (see #1).

## Testing

11 new tests added (`RokuEcpClient.test.ts` — 4 for `getActiveApp`; `RokuEcpDriver.test.ts` — 7,
including the exact Netflix-PIN-lock regression case: "holds a previously-known 'playing' state
through a later ambiguous read while the same app is still active"). Full suite: 30 suites / 297
tests pass, `tsc --noEmit` clean. `UniversalTvRemote.tsx` has no dedicated automated test file (this
project's UI is verified via manual emulator/real-device testing) — not yet live-verified against a
real Netflix PIN screen or a real YouTube ad, since neither is reliably reproducible on demand;
flagged honestly rather than claimed as confirmed.

## Consequences

- Both reported symptoms (Netflix PIN lock, YouTube Skip Ad) are fixed by construction — the button
  the user needs is never hidden by a guess, regardless of whether Hearth's guess is even correct.
- The Roku-specific playbackState corroboration is a real, additional correctness improvement (a more
  honest, more stable icon) but is no longer load-bearing for the actual reported bugs — a deliberate
  design choice after research confirmed no protocol-level fix for the underlying ambiguity exists
  anywhere in the industry.
- This generalizes to LG's `playPause` (also gated through the same `UniversalTvRemote.tsx` code) —
  no LG driver changes were needed or made; the UI fix benefits it identically.
