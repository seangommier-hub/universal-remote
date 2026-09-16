# ADR-HEARTH-073: Retry just the failed steps of a Scene, not the whole thing

**Date:** 2026-09-16
**Status:** Accepted, implemented

## Context

Sean: "keep working and look at other apps, use all agents." Three parallel research agents
investigated real, shipped competitor apps (Apple TV Remote, Roku's official app, Google Home,
Logitech Harmony, Home Assistant, plus real user complaints across competing universal-remote
apps) for concrete, evidence-backed feature gaps — not guesses. Full findings summarized below;
this ADR covers the one item all three reports converged on as the best value/effort ratio.

## Research summary (all three reports)

- **Apple TV Remote / Roku app**: a swipe-based touchpad for d-pad navigation (Apple's signature
  feature) and a dynamic "recently launched apps" row (Roku's own app touts this) are both real,
  evidenced, and technically feasible on Hearth's existing driver capabilities — bigger builds,
  not undertaken this pass. Private listening and voice search are confirmed infeasible
  (proprietary protocols/cloud services Hearth has no access to).
- **Home Assistant / community pain points**: the single most common, most concrete complaint
  across competing apps' own reviews is connection resilience after backgrounding or a Wi-Fi
  network switch — worth a dedicated future pass verifying Hearth's existing reconnect logic
  (ADR-HEARTH-017/App-lifecycle work) actually covers the Wi-Fi-switch case specifically, not just
  app-foreground. Home-screen/lock-screen widgets are a real, requested feature but confirmed
  **not** available in Expo Go (`docs/EXPO_COMPATIBILITY.md` #16, added this session) — needs a
  Dev Build.
- **Google Home / Logitech Harmony**: Harmony's "Activity" system was widely regarded as its best
  feature. Its single most valuable, smallest-to-build piece: the "Help" button re-sends just the
  specific out-of-sync step rather than re-running the whole activity from scratch (real Harmony
  support docs + reviews, cited below) — directly buildable on Hearth's existing `sceneRunner.ts`,
  which already tracked exactly which steps failed and why. **This is what got built.**
  Configurable inter-step delays and separate on/off sequences per Scene are real Harmony features
  too, bigger lifts, not built this pass.

Sources: Harmony's own Help-feature and Activities documentation
(support.myharmony.com/en-us/using-the-harmony-help-feature-to-fix-a-problem,
support.logi.com/hc/en-us/articles/360023411413-Understanding-Harmony-activities), Tom's Guide's
Harmony Ultimate review (calls the Help feature a standout).

## Decision

`sceneRunner.ts`'s `runScene()` already returned `SceneRunResult.failed[]` with
`deviceId`/`capability`/`message` but not the original `args` — meaning a retry couldn't
reconstruct a failed `inputSelection`-style action exactly. Refactored the shared sequencing logic
into a private `runActions()` used by both `runScene()` (a full Scene) and the new
`retrySceneActions()` (just a given list of failed actions) — `failed[]` entries now spread the
full original `SceneAction` (including `args`) plus the failure `message`
(`FailedSceneAction`), so a retry has everything it needs.

`App.tsx`'s `handleRunScene` already showed a dismiss-only `Alert` on failure. It now passes
`{ text: "Retry Failed" }` alongside Dismiss, calling `retrySceneActions()` with exactly the
failed entries and re-presenting the same alert shape recursively — `totalActions`/
`cumulativeSucceeded` are threaded through explicitly across retries so the alert always reads
against the scene's real original total ("4 of 4 actions ran" after a successful retry), not
reset to "1 of 1" against just the retry attempt.

## Verification

4 new tests (`sceneRunner.test.ts`): args survive into a failed entry, a retry re-runs exactly the
given actions in order with their original args, a retry failure is still reported (not silently
dropped), and an empty retry list runs cleanly. All 7 pre-existing `runScene` tests pass unchanged
— the refactor is additive, not a breaking shape change. Full suite: 31 suites / 314 tests,
`tsc --noEmit` clean. Not yet live-verified against a real failing Scene — no real-hardware
failure was available to test against this session.

## Consequences

- A household with a multi-device Scene that partially fails (one device briefly unreachable) no
  longer has to re-run every step, including ones that already succeeded, just to fix the one that
  didn't.
- The other real findings from this research pass (swipe d-pad touchpad, recent-apps row,
  Wi-Fi-switch reconnect hardening, configurable Scene delays, separate on/off Scene sequences,
  Google Home's Favorites-vs-Rooms split) are documented here as real, evidenced backlog items —
  not built this pass, not silently dropped either.
