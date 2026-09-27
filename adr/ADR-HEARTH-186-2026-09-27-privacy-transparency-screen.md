# ADR-HEARTH-186: "What leaves your house" privacy transparency screen

**Date:** 2026-09-27
**Status:** Accepted. Implements ADR-HEARTH-162 Track B item 12.

## Context

ADR-HEARTH-162 (item 12) called for a plain-language screen "stating what passes through
Cloudflare." Before writing any copy, every actual outbound network path in the app was audited
directly in code — no claim on the screen is asserted from memory or from what the feature was
*supposed* to do; each line traces to a file and line read during this pass.

## Audit findings

**Family Command Center request routing** (`src/core/network/fccRequest.ts`,
`src/core/network/fccConnectivity.ts`, `src/discovery/familyCommandCenterConfig.ts`): every call
through `fccFetch` tries the LAN `baseUrl` first, and only falls back to the optional
`publicBaseUrl` (a Cloudflare Tunnel address, e.g. `https://hearth-relay.carddna.app`) when the LAN
address can't be reached at all — the expected state away from home. This is genuinely optional:
`publicBaseUrl` is unset until the household explicitly configures an away-from-home address in
Family Command Center settings, so the screen only claims the tunnel is used when one is actually
configured (checked live via `loadFamilyCommandCenterConfig()`).

**Home Assistant** (`src/drivers/homeAssistant/HomeAssistantClient.ts`,
`haDeviceFactory.ts`, `src/ui/AddHomeAssistantScreen.tsx`): `HomeAssistantClient` calls
`fetchWithTimeout` directly against the `baseUrl` the household typed in when pairing (e.g.
`homeassistant.local:8123` or a remote-access hostname) — it never goes through `fccFetch` or
Family Command Center at all. The token is embedded in the device's own `config` and used only in
an `Authorization` header, never logged or put in a URL. So whatever address Home Assistant was
told to listen on (local network or its own remote-access setup) is exactly where this traffic
goes — Hearth has no visibility or control over that beyond the address the user gave it. The
screen only shows this line when a device with `driverId === "home-assistant"` is present.

**SmartThings** (`src/drivers/outlet/smartthings/SmartThingsClient.ts`): by contrast, SmartThings
is proxied entirely through Family Command Center's own server — the phone never holds a
SmartThings credential at all, and `SmartThingsClient` calls `fccFetch`, not SmartThings' cloud API
directly. This is already covered by the general "device commands... through Family Command
Center" line; it gets no separate bullet.

**SwitchBot** (`src/drivers/vacuum/switchbot/SwitchBotClient.ts`): a genuine, real exception found
during the audit — `SwitchBotClient` calls `https://api.switch-bot.com/v1.1` directly from the
phone (HMAC-signed with a token/secret pair the user generates in the SwitchBot app), completely
bypassing Family Command Center. This is a real egress path that would have made "nothing else
leaves this house" a false claim if a SwitchBot device is connected, so it gets its own
conditional line (shown only when a device with `driverId === "switchbot-vacuum"` is present).

**PS5 pairing** (`src/drivers/gaming/ps5/Ps5Client.ts`): the PSN login/PIN pairing flow is driven
entirely through Family Command Center's own proxy endpoints (`fccJsonRequest`); the household
member does open a real Sony login page in their own browser as part of pairing, but that's the
person choosing to visit Sony's site, not the app silently shipping data there. No separate bullet
needed — already covered by the general device-commands line, and it's an edge case not worth
adding screen noise for.

**Client log shipping** (`src/runtime/clientLogShipper.ts`,
`src/discovery/familyCommandCenterClientLog.ts`, `src/core/logging/redact.ts`): warn/error log
lines are redacted (`redactMessage`/`redactMeta` strip bearer tokens, passwords, secrets, API keys
by key-name and by pattern, per `SENSITIVE_WORDS` in `redact.ts`) before being POSTed via
`postClientLogBatch` → `fccFetch` — same LAN/tunnel routing as device commands, at most once a
minute (`SHIP_INTERVAL_MS`). Destination is Family Command Center only.

**Crash reporting / analytics:** grepped the whole source tree and `package.json` for
`sentry|analytics|crashlytics|bugsnag|firebase|mixpanel|amplitude|posthog` (case-insensitive). The
only hit is a literal string `@sentry/react-native` inside the Jest config's
`transformIgnorePatterns` regex (boilerplate that's never been exercised — no such package is
installed, `package.json` has no Sentry dependency). There is no crash-reporting or analytics SDK
anywhere in this app. The screen's claim that logs go "never to Anthropic, Expo, or anyone else...
There is no crash-reporting or analytics service in this app at all" is verified true, not assumed.

**Household activity log** (ADR-HEARTH-162 item 2, "Sean turned off the living room TV"): searched
for any implementation (`activityLog`, `ActivityLog`, "household activity") — none exists yet, it's
still a roadmap item. `activities.history` in `useActivities.ts` is the Scenes run-history, kept
local, never shipped anywhere. Correctly omitted from the screen since it isn't real yet.

**EAS Update** (`src/runtime/appUpdates.ts`, `expo-updates` in `package.json`): `expo-updates` is a
real, installed dependency; `checkAndDownloadUpdateAsync()` calls
`Updates.checkForUpdateAsync()`/`Updates.fetchUpdateAsync()`, which genuinely phone home to Expo's
own EAS Update servers to check for and download OTA updates. This is asserted as true, not
downplayed.

**Ring/camera:** no Ring integration and no dedicated camera driver exist in this codebase (the
only "camera" hits are the QR-scan camera view and Home Assistant's own `camera_snapshot` support,
which — like every other HA call — goes directly to whatever address Home Assistant was configured
with, already covered by the Home Assistant line). Skipped per the task's own scope note.

## Decision

Added `src/ui/WhatLeavesYourHouseScreen.tsx`, reachable via a new "What leaves your house" button
on `FamilyCommandCenterSettingsScreen`, wired into `DevicesTabScreen`'s `fcc-privacy` screen state.
The actual line-selection logic (which entries apply) lives in `src/ui/privacyDisclosure.ts`
(`buildPrivacyEntries`, `nothingElseLeaves`) so it's unit-testable independent of React Native
rendering, per this project's existing convention (`describeDeviceStatus.ts` and siblings) and the
global standing rule to keep files single-purpose. Every conditional line only appears when the
corresponding integration is actually configured (`devices.some(d => d.driverId === ...)` for Home
Assistant / SwitchBot, `loadFamilyCommandCenterConfig()` for the away-from-home tunnel address), so
the screen can never claim something is happening that isn't — and the "Nothing else leaves this
house" closing line only renders when neither Home Assistant nor SwitchBot is connected, since
those are the only two real exceptions this audit found.

## Consequences

- The closing line is conditional, not a blanket claim — if the household later connects Home
  Assistant or a SwitchBot device, the closing line correctly disappears without any further
  screen changes needed.
- If a future integration adds another direct-from-phone cloud egress path (as SwitchBot did),
  that driver's author must add a corresponding entry to `privacyDisclosure.ts` — there's no
  automatic detection of "does this driver call an external host," so this is a discipline the next
  ADR touching a new driver should carry forward.
- Verified with `npx tsc --noEmit` (clean) and `npx jest --silent` (1377 passed, 18 skipped, only
  pre-existing `runner/shims/shims.test.ts` failure — an unrelated `ws.WebSocketServer` environment
  gap, not caused by this change). Screen visually verified via the web harness at both desktop and
  mobile (375×812) widths — content scrolls correctly under the sticky "Done" footer at mobile
  width rather than being clipped.
