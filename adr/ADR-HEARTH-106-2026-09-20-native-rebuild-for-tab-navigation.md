# ADR-HEARTH-106: Native rebuild + TestFlight resubmission for tab navigation

**Date:** 2026-09-20
**Status:** Accepted, implemented; submitted to TestFlight, processing

## Context

Two concurrent sessions worked in this same project today: this session (Wake-on-LAN, Broadlink,
Apple TV) and a separate session building a squirrel feeder ESP32 integration plus a bottom-tab
navigation rewrite (ADR-HEARTH-104). Coordinated directly session-to-session (via SendMessage)
rather than guessing at file-collision risk, confirmed via direct message exchange with each
session before touching shared files or shipping anything.

Before shipping, checked what ADR-HEARTH-104's commit actually added to `package.json`:
`react-native-gesture-handler` and `react-native-screens` — both real native iOS/Android modules,
required by React Navigation's tab bar. Every other change shipped today (Wake-on-LAN, Broadlink,
Apple TV) was pure JS/TS and went out via `eas update` (OTA) with no rebuild, per this project's
established pattern (ADR-HEARTH-084). This one is different: **`eas update` can only push
JavaScript — it cannot add a native module to a binary that doesn't already have it compiled in.**
Pushing this via OTA would have shipped a JS bundle whose first render calls into native code that
doesn't exist on Sean's (and his wife's) already-installed app, crashing it on launch.

Caught this before shipping anything, flagged it to both the user and the other session rather
than proceeding on the peer's original "eas update now" assumption — confirmed directly with Sean
before triggering a real `eas build` (a materially bigger, slower action than every other push
today, consuming real build resources and ending in a required reinstall).

## Decision

1. **Bumped `expo.version` from `1.0.0` to `1.1.0`** in `app.config.js`. Per ADR-HEARTH-084's own
   `runtimeVersion: { policy: "appVersion" }`, builds sharing the same `version` share the same OTA
   channel — leaving it at `1.0.0` would let a future JS-only OTA push (once one assumes
   gesture-handler/screens exist) reach the *old*, still-installed `1.0.0` binary and crash it. A
   distinct version keeps old and new binaries on non-overlapping update channels going forward.
2. **`eas build --profile production --platform ios --non-interactive`** — succeeded end-to-end
   with EAS's existing remote-managed iOS credentials (distribution cert + provisioning profile
   already valid from the two prior production builds, per ADR-HEARTH-083; no interactive TTY
   needed this time, unlike the original ADR-HEARTH-081 dev-profile blocker). Build number
   auto-incremented 2 → 3.
3. **`eas submit --profile production --platform ios --latest --non-interactive`** — required the
   App Store Connect API key (`AuthKey_M8QMUJH79C.p8`, Key ID `M8QMUJH79C`, Issuer ID
   `a6fa85c1-b373-40ab-a159-f3e03dd162e9`, per ADR-HEARTH-081) via `EXPO_ASC_API_KEY_PATH`/
   `EXPO_ASC_KEY_ID`/`EXPO_ASC_ISSUER_ID` env vars, matching `eas.json`'s `submit.production.ios`
   config. **The `.p8` file was not present anywhere in this project, its env vars, or Sean's
   Windows user environment** — checked all three before asking. Sean located it in his own
   Downloads folder (`AuthKey_M8QMUJH79C.p8`) and provided the path directly; submission then
   succeeded immediately with the same Key ID/Issuer ID already on file from ADR-081.

## Consequences

- Build #3 (version 1.1.0, bundle `com.seangommier.hearthapp`) bundles everything shipped today —
  Wake-on-LAN TV power-on, the Broadlink IR/RF hub driver, the Apple TV driver, and the squirrel
  feeder + tab navigation — into one combined native binary, submitted to App Store Connect and
  processing for TestFlight as of this writing (Apple's own 5–10 minute turnaround).
- **Closed the same day**: Sean provided the `.p8` from his Downloads folder; it's now copied into
  `ios-credentials/` at the repo root (the same gitignored folder ADR-HEARTH-081 already uses for
  the distribution cert/key/profile — confirmed via `git check-ignore` before placing it there,
  never tracked). Both env-var naming conventions this project's tooling actually reads —
  `EXPO_ASC_API_KEY_PATH`/`EXPO_ASC_KEY_ID`/`EXPO_ASC_ISSUER_ID` (`eas submit`, per `eas.json`) and
  `EAS_ASC_KEY_PATH`/`EAS_ASC_KEY_ID`/`EAS_ASC_ISSUER_ID` (the `scripts/ios-credentials/*.js`
  helpers from ADR-HEARTH-082) — are now set as persistent Windows *User*-scope environment
  variables pointing at that same file, verified by reading each one back. Per ADR-GLOBAL-008: a
  future `eas submit` (this session's or any other's) needs no re-asking, no Downloads-folder
  hunting, and no inline env vars passed by hand — it just works, the same way the build
  credentials already did.
- Every future JS-only change can resume going out via plain `eas update` once this build is
  installed — this ADR's process (bump version, `eas build`, `eas submit`) is specifically for
  native-dependency changes, not the default path.
- Sean and his wife both need to reinstall via TestFlight once Apple finishes processing — this is
  the one native rebuild this project has needed since the OTA pipeline (ADR-HEARTH-084) was set
  up; every other change today and prior shipped without it.
