# ADR-HEARTH-116: Merge Roku's Select and Play/Pause too — a knowing, accepted regression

**Date:** 2026-09-20
**Status:** Accepted, implemented

## Question, answer, rationale (ADR-GLOBAL-002)

**Question asked:** After ADR-HEARTH-114 merged LG's Select/Play/Pause (safe there — webOS resolves
the ambiguity on-device), Sean asked more broadly why the same behavior shouldn't just be uniform
everywhere. He was shown, explicitly, that uniformity has exactly two directions: (1) revert LG
back to separate buttons, matching Roku/Samsung's real hardware (confirmed via a real Samsung
remote photo showing a dedicated, separate physical Play/Pause button), or (2) merge Roku too,
knowingly reintroducing the exact regression ADR-HEARTH-068 fixed on 2026-09-15 (Netflix's PIN
lock, YouTube's Skip Ad — see that ADR for the full original research). He was asked directly to
choose between those two, with the Roku consequence stated plainly before he answered.

**Answer:** "2" — merge everywhere, accept the Roku regression.

**Rationale (Sean's stated priority):** consistent one-button interaction behavior across every
device outweighs avoiding two specific, real, but narrow edge cases (a PIN-lock overlay, an
in-video ad's Skip button) on one platform.

**Date logged:** 2026-09-20.

## Decision

`RokuEcpDriver.ts`'s `ROKU_CAPABILITIES` replaces `"select"` and `"playPause"` with
`"selectPlayPause"` — the same capability id LG uses (ADR-HEARTH-114), so `UniversalTvRemote.tsx`
needed zero changes: it already renders the merged d-pad center button for any device declaring
`selectPlayPause`, and already stops rendering the separate always-visible Play/Pause row for any
device that no longer declares standalone `playPause`.

The merged case reinstates the *original*, pre-ADR-HEARTH-068 design, precisely:

```
if (playbackState === "playing" || playbackState === "paused") {
  send ECP "Play" (Roku's real, documented toggle key)
} else {
  send ECP "Select"
}
```

This is a deliberate, informed reversal of ADR-HEARTH-068's specific fix for Roku — not a
rediscovery of the same bug by accident. The corroboration logic ADR-068 added
(`refreshPlaybackState`'s `/query/active-app` fallback, holding a previously-known state through an
ambiguous read rather than assuming "stopped") is unchanged and is now *more* load-bearing than
before: it no longer just affects a cosmetic icon, it decides which literal command the next press
sends.

## Consequences

- **Netflix's PIN lock**: unaffected by this specific change — an ambiguous read still holds the
  prior known state (still "playing" per the corroboration logic), and "playing" still routes to
  the toggle branch (`Play`), same behavior either way. This particular symptom was never actually
  about the button split; ADR-068's real fix for it was the corroboration query itself, which stays.
- **YouTube's Skip Ad**: this is the actual, knowingly reintroduced regression. While a video is
  confidently "playing" and Skip Ad is on screen, the center button now sends `Play` (which Roku
  will interpret as pause/resume) instead of `Select` — there is no way to tap Skip Ad through this
  button in that moment. Reachable workaround: none via the merged button; a user would need to
  wait out the ad or use the d-pad differently if this becomes a real, live-encountered nuisance —
  not solved here.
- Consistent single-button behavior now exists across LG and Roku. Samsung and Sony are unaffected
  (neither declares `playPause`, so there's nothing to merge yet).
- `npx tsc --noEmit` clean; full suite 911/911 passing. `RokuEcpDriver.test.ts` updated: capability
  assertions now check for `selectPlayPause` and the absence of standalone `select`/`playPause`;
  the three existing toggle-behavior tests renamed to the merged capability (behavior unchanged
  when state is known); added one new test confirming the Select fallback when state is not
  confidently known, so navigation never silently breaks.
- If this turns out to bother real use more than expected, the revert is small and isolated: split
  `selectPlayPause` back into `select`/`playPause` in `ROKU_CAPABILITIES` and restore the two
  separate `applyCommand` cases from ADR-HEARTH-068 (preserved verbatim in that ADR and in git
  history) — nothing else in the app depends on Roku specifically having the merged capability.
