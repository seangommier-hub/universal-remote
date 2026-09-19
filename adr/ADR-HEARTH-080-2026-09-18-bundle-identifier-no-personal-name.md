# ADR-HEARTH-080: Bundle identifier changed off `com.hearth.app`, no personal name in it

**Date:** 2026-09-18
**Status:** Accepted, implemented

## Context

The first real `eas build --profile development --platform ios` attempt (using the App Store
Connect API key, Team ID `ZR2575A26A`, now-active Apple Developer Program membership) failed with
Apple's own API error: "An App ID with Identifier 'com.hearth.app' is not available." Bundle
identifiers are globally unique across every Apple developer account, not just Sean's own team.
Checked Sean's Certificates, Identifiers & Profiles page directly — `com.hearth.app` does not exist
anywhere in his account (so this isn't a leftover from an earlier partial attempt); it also already
has an unrelated Xcode-auto-generated App ID, `com.seangommier.hearthapp`, from earlier local
AltServer sideloading work.

## Question asked (ADR-GLOBAL-002)

Asked Sean what the real bundle identifier should be, offering two options: a clean
`com.seangommier.hearth` (matches the existing personal-namespace convention already on the
account) or reusing the exact existing `com.seangommier.hearthapp`.

## Answer

Sean: "if it is public i would rather my name not be in it, i would prefer Hearth Remote Home
Controller" — rejecting both offered options in favor of a namespace with no personal name at all.

## Decision

Changed both `expo.ios.bundleIdentifier` and `expo.android.package` in `app.json` from
`com.hearth.app` to **`com.hearthremote.app`** — reflects "Hearth Remote" without any personal
name, short enough to plausibly be available, and keeps iOS/Android identifiers matching each other
as they already were.

## Rationale

Bundle identifiers are technically public metadata (visible via things like deep-link schemes,
provisioning profiles, or App Store Connect listings) even for an internal/personal-use build never
submitted to the public App Store — Sean does not want his name discoverable through it, overriding
the otherwise-natural convention (already used elsewhere on this same Apple account) of
namespacing personal projects under `com.seangommier.*`.

## Consequences

- `com.hearth.app` is abandoned everywhere it was referenced (app.json only — nothing else in the
  codebase hardcoded it); the existing unrelated `com.seangommier.hearthapp` Xcode artifact is left
  alone, unrelated to this change.
- Actual availability of `com.hearthremote.app` was not knowable ahead of time (Apple only reports
  a conflict at registration time) — verified by the next real build attempt, not guessed.
- If `com.hearthremote.app` also turns out to be taken, the next candidate must still avoid any
  personal name, per this same decision — not silently revert to `com.seangommier.*`.
