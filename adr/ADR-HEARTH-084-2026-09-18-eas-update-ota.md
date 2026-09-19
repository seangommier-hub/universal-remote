# ADR-HEARTH-084: EAS Update (OTA) configured for JS-only pushes

**Date:** 2026-09-18
**Status:** Accepted, implemented; requires one more full rebuild to take effect

## Context

After getting TestFlight working (ADR-HEARTH-083), Sean asked: "i don't want to use test flight
why can the app not just be updated." The real answer: it partially can. EAS Update lets an
already-installed build fetch a new JS bundle directly from Expo's servers with no App Store /
TestFlight review and no reinstall — but it wasn't set up yet (this session's builds so far had no
`expo-updates` runtime baked in), and it fundamentally only covers JS/asset changes, never native
ones (new permissions, new native modules, the bundle identifier/signing work done earlier tonight).
Confirmed with Sean before proceeding, since it's a real architecture addition with that tradeoff,
not a free upgrade: he chose yes.

## What was done

- `npx expo install expo-updates`.
- `eas update:configure` — as expected for a dynamic `app.config.js` (same limitation hit in
  ADR-HEARTH-083's `autoIncrement` fix), it couldn't write directly into the config; it printed the
  exact values needed and I added them by hand: `expo.updates.url` (the project's own
  `u.expo.dev/<project-id>` endpoint) and `expo.runtimeVersion.policy: "appVersion"` — meaning any
  build sharing the current `version` field can safely receive the same OTA update.
- Added a `channel` field to each `eas.json` build profile (`development`, `preview`,
  `production`), matching the profile's own name — the mechanism that scopes which builds see which
  pushed updates.

## Consequences

- **One more full rebuild is required** before this does anything — no currently-installed build
  (the ad-hoc ones or the TestFlight one already submitted) has the `expo-updates` runtime compiled
  in. After that rebuild, future JS-only changes go out via `eas update --branch <channel> --message
  "..."` instead of a new build + TestFlight submission cycle.
- **Native changes still need a full rebuild+resubmit**, exactly as before — OTA only covers code
  that doesn't touch native modules, permissions, or anything else baked into the binary itself.
  Bumping `expo.version` (not just the build number) is the intended signal for "this needs a new
  binary."
- Going forward, before pushing an OTA update, a quick judgment call is needed each time: did this
  change touch anything native? If yes, a full build is still required — OTA is an addition to the
  existing build/TestFlight pipeline, not a replacement for it.
