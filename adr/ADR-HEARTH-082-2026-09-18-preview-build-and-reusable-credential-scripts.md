# ADR-HEARTH-082: Preview builds for real-device installs; ad hoc credential scripts made reusable

**Date:** 2026-09-18
**Status:** Accepted, implemented

## Context

The first real iOS build (ADR-HEARTH-081, `development` profile) got Hearth onto Sean's phone, but
exposed real friction unrelated to Apple/EAS credentials: a `development` build needs Metro (the JS
bundler) reachable at runtime, so first launch showed "Searching for development servers" and
failed until Sean either matched his phone's WiFi network to his PC's or manually entered the
Cloudflare tunnel URL. After finally getting it working, Sean: "there needs to be much easier ways
to get devices connected."

## Decision

1. **Added a `preview` build profile with local iOS credentials** (`eas.json`): same
   `credentialsSource: "local"` / `credentials.json` setup as `development`, but without
   `developmentClient: true` — a preview build embeds the JS bundle directly in the app at build
   time, so there's no Metro/tunnel dependency at all after install. This is the actual fix for "get
   devices connected easily" — not a UX patch on top of the dev-server flow, removing the dev-server
   dependency entirely for anyone who isn't actively live-coding against the app.
2. **Consolidated the one-off App Store Connect API scripts from ADR-HEARTH-081 into
   `scripts/ios-credentials/`** (`mintAscJwt.js`, `appStoreConnectApi.js`,
   `regenerateProvisioningProfile.js`) — each one small and single-purpose, per this project's own
   modular-scripts standard, rather than left as disposable scratchpad files. Adding a new device
   (e.g. Sean's wife's phone, still pending an Apple account "security delay" as of this writing) is
   now: `eas device:create` (still needs Sean's own interactive terminal — genuinely requires his
   input to open the registration link) → `node scripts/ios-credentials/regenerateProvisioningProfile.js`
   → `eas build --profile preview --platform ios --non-interactive` → done. No more re-deriving
   JWTs or API calls from scratch.
3. Fixed two real bugs found while building this: `appStoreConnectApi.js`'s response handling
   crashed on empty bodies (e.g. a `DELETE`'s 204 response) — now reads the body as text first and
   only parses JSON when there is any. Separately, the project's own `.gitignore` had an unanchored
   `ios-credentials/` pattern that was silently also matching (and hiding from `git status`) the
   new, intentionally-committed `scripts/ios-credentials/` folder — changed to `/ios-credentials/`
   to anchor it to the repo root, where the actual secret cert/key/profile files live.

## Consequences

- Sean and any future household member install a `preview` build once and it just works — no
  Metro, no network-matching, no manual URL entry. `development` builds remain available (and
  still work, per ADR-HEARTH-081) for actual live-coding sessions.
- A `preview` build does NOT hot-reload JS changes — every code change needs a new build to test on
  a real device this way. `expo start` + Expo Go (for the parts of the app that don't need native
  modules this session already built) or a `development` build remain the right tools for active
  development; `preview` is specifically for "install it and use it" distribution to household
  members who aren't debugging the app itself.
- Spawned a background research agent (read-only) to separately audit Hearth's own in-app device
  pairing/onboarding flow (Family Command Center discovery, per-device setup) for friction a second
  household member might hit — a distinct problem from this ADR's build-tooling fix, findings to be
  triaged separately once the agent reports back.
