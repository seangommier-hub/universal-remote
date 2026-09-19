# ADR-HEARTH-087: `expo-updates` needs an explicit plugin entry — it wasn't compiled into any build

**Date:** 2026-09-19
**Status:** Fixed

## Context

After ADR-HEARTH-084 configured EAS Update and ADR-HEARTH-086 built the in-app check UI, Sean
reported the update wasn't reaching his phone at all after a real force-close/relaunch. Server-side
diagnostics all checked out: `eas channel:view preview` showed the correct branch/update-group
mapping, the installed build's own metadata (`eas build:view --json`) showed the correct
`updateChannel: preview` and `runtime.version: 1.0.0`, and directly simulating the exact HTTP
request `expo-updates`' native client makes (`curl` with `expo-channel-name`/`expo-runtime-version`
headers straight to `u.expo.dev`) returned a valid 200 manifest.

None of that proved the *client* could actually act on any of it. Downloaded the real installed
`.ipa` and inspected its compiled `Info.plist` directly: zero `EXUpdates*` keys anywhere —
`EXUpdatesURL`, `EXUpdatesRuntimeVersion`, all absent — while `expo-camera`'s
`NSCameraUsageDescription` (an unrelated plugin) was correctly present. This proved prebuild's
plugin pipeline works in general; `expo-updates` specifically never ran its own config plugin, on
any build made since it was installed (the `development` rebuild, both `preview` rebuilds, and the
`production` rebuild already submitted to TestFlight all share this gap).

## Root cause

`expo-updates` does not get the same "legacy plugin" automatic application that `expo-camera` and
`expo-secure-store` get from merely being listed as a dependency — it needs an **explicit** entry in
`app.config.js`'s `plugins` array. Nothing in `eas update:configure`'s own output, or Expo's docs
consulted while setting this up, flagged that this specific package needed it; the gap was only
caught by directly inspecting the compiled binary rather than trusting config resolution
(`npx expo config --json` correctly showed `updates`/`runtimeVersion` — those fields were never the
problem) or server-side signals (never wrong either).

## Fix

Added `"expo-updates"` to `app.config.js`'s `plugins` array. Verified `npx expo config --json` now
lists it. **Every build made before this fix is permanently unable to receive OTA updates** — no
server-side or JS-only fix can retroactively wire up a native module into an already-compiled
binary. `preview` was rebuilt immediately; `production` (already on TestFlight) needs the same
rebuild + resubmit before OTA works there either.

## Consequences

- This is the second real config-plugin/dynamic-config gap found in one evening (the first being
  `autoIncrement` needing `appVersionSource: remote`, ADR-HEARTH-083's addendum) — worth treating
  "does `npx expo config --json` show the field I expect" as necessary but **not sufficient**
  verification for anything touching native modules going forward; the compiled binary is the only
  real source of truth for whether a plugin actually applied.
- Confirms the general diagnostic technique (download the `.ipa`, `unzip`, inspect `Info.plist`
  directly) as a reliable, fully self-serve way to verify native config without needing Sean's
  phone at all — worth reaching for immediately next time a "why doesn't this native feature work"
  question comes up, rather than working through server-side possibilities first.
