# ADR-HEARTH-093: Now-playing widget on the home screen

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Sean: "a widget much like the itunes/music player that has start stop back and home with the
title and thumbnail of whatever is being played but do one at a time."

## Decision

- `useNowPlaying.ts`: picks a single device to feature — whichever device is `"playing"` (checked
  first) or `"paused"` (fallback) right now, across every paired device, via
  `StateStore.subscribe`. Deliberately one at a time, not one widget per playing device, per
  Sean's own explicit scoping. Ties (more than one device playing/paused simultaneously) resolve
  to the first match found — there's no other signal to break the tie by, and this is a
  convenience widget, not something that needs a "most recent" ordering guarantee.
- Title resolution (`resolveTitle`, exported and unit-tested as a pure function): prefers a
  driver's own live active-app name when available, falls back to resolving the device's
  last-launched app id against its installed-app catalog, falls back to a generic "Now Playing"
  label rather than showing nothing.
- **Roku's real active-app name, already fetched and previously discarded**: `RokuEcpDriver.ts`'s
  `refreshPlaybackState` already calls `client.getActiveApp()` (for `isHomeScreen`/`isScreensaver`
  corroboration) but only ever used those two booleans — the real `appName` field it also returns
  was thrown away. Now patched into `state.values.activeAppName` when a real app is confirmed
  active, at zero extra network cost, the same "already fetched, just unused" pattern as
  ADR-HEARTH-085/088's suggested-name work.
- **No real thumbnail/artwork exists anywhere in this app's protocols.** Roku ECP, LG SSAP, and
  every other driver here expose at most an app *name* — never poster art or per-title metadata
  for what's actually playing within that app (Netflix's own current title, for instance, is not
  obtainable this way). `NowPlayingWidget.tsx` shows a generic playback icon, never a fabricated
  thumbnail — this is a real, honest scope limit, not an oversight.
- Controls (back/playPause/home) render only when `device.capabilities` actually includes them —
  the same "never show a control the device can't really do" rule every other screen in this app
  already follows — and route through the same `CommandEngine.execute()` every other button uses,
  so a failure behaves identically (never throws, silently no-ops on the widget).

## Verification

New tests: `useNowPlaying.test.ts` (title-resolution precedence, blank-string handling, no-match
fallback) and two new `RokuEcpDriver.test.ts` cases (`activeAppName` set when a real app is
confirmed active, left unset when confirmed idle instead). Full suite: 35 suites / 373 tests
passing, `tsc --noEmit` clean.

## Consequences

- Ships as a pure JS/UI change via EAS Update — no native additions, no rebuild required.
- LG's driver doesn't yet feed anything into `activeAppName` (only Roku does, since only Roku's
  connect flow already fetches a real app name as a byproduct of other corroboration logic) — the
  widget still works for LG via the `lastLaunchedAppId` fallback, just with an app name that only
  reflects what was launched *through Hearth*, not necessarily what's genuinely on screen right
  now if the user navigated elsewhere on the TV itself.
- Samsung and Sony have no `playPause`/media-state capability at all (a real, already-documented
  protocol gap — see `Capability.ts`'s own citations), so they never appear in this widget
  regardless of what they're doing.
