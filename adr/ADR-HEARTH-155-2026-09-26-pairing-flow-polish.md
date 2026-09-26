# ADR-HEARTH-155: Guided, time-boxed pairing with plain-language errors; a shorter PS5 flow

**Date:** 2026-09-26
**Status:** Accepted, implemented; on-device behavior not yet verified (see Verification)

## Context

An audit of adding a device found: LG's Allow prompt times out after 30s and Samsung's after 20s with
only a generic wait; Apple TV needs a PIN from the TV; PS5 needed a browser sign-in, copying the
address of a redirect page, pasting it and a PIN (about eight taps, the worst flow in the app); Sony
needs a PSK from a TV menu; Xbox had no check at add time; Hue needs a link-button press. Errors were
raw driver strings and nothing said what to look at on the TV.

## Decision

- **One state machine, `discovery/pairingSession.ts`** (no React): owns the countdown, retry, cancel
  and a 900ms "Connected!" hold. Cancel clears every timer, ends a pending sleep at once and routes a
  late result to a `discard` callback (e.g. disconnect the driver) instead of `onDone`. The countdown
  is computed from wall-clock time so a backgrounded app shows the truth, and it never fails the step
  itself: the driver's own timeout stays the source of truth.
- **One card, `ui/PairingProgressCard.tsx`** (via `ui/usePairingSession.ts`): brand heading, plain
  instruction, live countdown, `Animated` pulse (skipped under Reduce Motion), Cancel, one-tap Try
  again, and Connected!. Used by LG, Samsung, Apple TV, Hue, PS5, Sony, Xbox, and every generic brand.
- **Real timeouts, imported not copied:** `LG_PAIRING_TIMEOUT_MS`, `SAMSUNG_PAIRING_TIMEOUT_MS`
  (exported from the two clients), `HUE_PAIRING_MAX_WAIT_MS`, and new exported
  `APPLE_TV_PAIRING_*` / `PS5_PAIRING_*` poll constants.
- **One copy module, `discovery/pairingCopy.ts`:** the per-brand "look at your TV" prompts and
  `describePairingFailure(brand, label, error)` mapping LG (forgotten pairing / timeout / certificate),
  Samsung (denied with the Device Manager path / timeout), Sony (wrong PSK with the IP-control path),
  Roku 403 (Permissive network access), Apple TV (wrong PIN / timeout), PS5 (bad sign-in address /
  wrong code / timeout), Hue (link button timeout / different network) and network failures via
  `classifyNetworkFailure`. `describeAddFailure` delegates to it, so the Discover and Suggested adds
  get the same wording. Unrecognised errors keep the previous "Couldn't add ...: raw text" form.
- **PS5:** `Sign in with PlayStation` starts the login on Family Command Center and opens the sign-in
  in the in-app browser (`expo-web-browser`, already installed; system browser as fallback). Numbered
  steps say the blank/error page is expected and to copy the whole address. One paste box recognises a
  URL containing `code=` (`ps5Redirect.ts`) and submits without a Continue tap; the 8-digit code
  submits itself at 8 digits. Status polling moved to the shared `pairingPoll.ts` (the old copy waited
  before its first check and read a stale session id from closure state).
- **Xbox:** no non-waking check exists (power-on is a one-way UDP broadcast; the FCC route only sends
  it), so none was invented. Instead the Live ID's shape (16 hex characters) is checked immediately,
  with the exact Settings path and an "Add anyway" override in case the format assumption is wrong.

## Question and answer

- **Q: a "Paste from clipboard" button?** `expo-clipboard` is not in `package.json`, and adding a
  native module was out of bounds for this change. The paste box uses the system Paste and
  auto-detects the pasted address. Revisit if a native rebuild is acceptable.
  **A (decided in the request):** no new native dependencies. Logged 2026-09-26.

## Verification

Unit tests cover the session (countdown, retry, cancel cleanup, late results, Connected hold), the
failure copy per brand, the poll loop, the PS5 URL extraction and the Live ID check. Not verified on a
device: the in-app browser hand-off and how easily the redirect address can be copied from it, the exact
wording each TV shows (LG, Samsung), and whether an Apple TV or PS5 wrong-code error text matches the
copy patterns.
