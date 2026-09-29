# ADR-HEARTH-196: Settings-crash and "Leah got kicked off" live-bug investigation

Date: 2026-09-28
Status: Accepted (hardening fix landed; root cause not conclusively reproduced — see Consequences)

## Context
Sean reported two live symptoms the same day as a burst of merges: per-phone tokens (ADR-181),
roles phase 2 (ADR-189), kid mode (ADR-176), device grouping by type (ADR-193), Ring cameras
(ADR-191), Amazon plugs (ADR-192), and Home Assistant OAuth/discovery/domains (ADR-175/178/183/190).

1. "leah got kicked off" — her phone lost its Family Command Center connection/pairing.
2. Tapping the settings gear icon on the Devices tab (opens `FamilyCommandCenterSettingsScreen`)
   crashes the app on a real phone.

`node scripts/ui-verify/run.mjs --only=fcc-settings` did not reproduce a `pageerror` with the small
demo fixture, so a larger/more realistic dataset was built and every plausible code path read
end to end before touching anything.

## Investigation

### What was read, end to end
`FamilyCommandCenterSettingsScreen.tsx` and every component it renders (`KidModeSettingsPanel`,
`DeviceSharePanel`, `InviteSomeonePanel`, `PhoneNameField`, `RecentActivityList`,
`HouseholdPhonesScreen`, `WhatLeavesYourHouseScreen`), plus `familyCommandCenterConfig.ts`,
`householdPhones.ts`, `useKidMode.ts`/`kidModeState.ts`/`kidModeSettings.ts`,
`useDeviceLayout.ts`/`deviceLayout.ts`/`deviceGrouping.ts`/`deviceTypeGroups.ts`, and
`persistence.ts`/`Device.ts`.

**Findings from static review (all already safe, verified by new/existing tests):**
- `loadFamilyCommandCenterConfig()` already treats a missing `role`/`tokenKind` (a config saved
  before ADR-181/189 added those fields) as `undefined`, and every caller (`existing.role ===
  "owner"`, `usesLegacySharedToken`) already handles `undefined` correctly. Covered by
  `familyCommandCenterConfig.test.ts`.
- `normalizeLayout()` (`deviceLayout.ts`) tolerates a `hearth.deviceLayout.v1` record saved before
  `groupBy`/`collapsedTypes`/`kidAllowed`/`guestAllowed` existed — every field defaults safely via
  `stringList()`/`?? DEFAULT_GROUP_BY`. Verified live (see below), not just by reading.
  `groupIdForDevice()` (`deviceTypeGroups.ts`) already falls back to "Other" for a category not in
  `GROUP_BY_CATEGORY`, and this exact case (`groupIdForDevice({ category: "teleporter" as
  DeviceCategory })`) already has a passing unit test in `deviceTypeGroups.test.ts`. ADR-193's own
  exhaustiveness tests (every `DeviceCategory` mapped, no stale keys, every group used) all pass.
- `phone-tokens/self` and the admin `phone-tokens` route (Pi side, `src/lib/hearth/auth.ts`,
  `phone-tokens.ts`) treat a legacy shared-token caller as role `"owner"` unconditionally — a phone
  that hasn't re-paired for a personal token is never restricted. A newly-issued personal token
  defaults to role `"adult"` (not `"guest"`), so redeeming one does not silently restrict a phone.
- `HouseholdPhonesScreen.tsx`, `InviteSomeonePanel.tsx` wrap every `loadFamilyCommandCenterConfig()`
  call in `try/catch`; `initKidMode()` and `refreshOwnRole()` already fully catch internally and
  document (in their own docstrings) that they never throw/reject.

### Reproduction attempts (web harness, all negative)
Added a large "types" household to the harness (`scripts/ui-verify/scenarios.mjs`:
`fcc-settings-large-household`) — 15+ devices across every ADR-193 section (tv, streaming, audio,
lighting, outlet incl. an Alexa plug, camera x2 Ring, gaming, vacuum, feeder, climate, fan, cover,
lock, sensor, action) rendered inside the settings screen's own `DeviceSharePanel`. No `pageerror`.

Also ran, ad hoc, against a browser context seeded via `page.addInitScript` with a deliberately
OLD-SHAPED `hearth.deviceLayout.v1` (`{rooms, favorites, order}` only — the literal shape saved
before ADR-176/189/193 added `kidAllowed`/`guestAllowed`/`groupBy`/`collapsedTypes`), on both the
Devices tab and the settings screen, with the large household. No `pageerror`. Also re-ran the
existing `household-phones`/`household-phones-guest-invite` scenarios, which already exercise 3
phones (owner/adult/guest) with a guest `guestExpiresAt`. No `pageerror`.

**Honest conclusion: no `pageerror`/crash was reproduced**, in the web harness, despite a real
effort with a large/varied device list, an old-shaped persisted layout, and a multi-role phones
list. This matches Sean's own observation that the small demo fixture doesn't reproduce it, and
extends that finding to a much larger one too — the gap is very likely something the web harness
cannot model at all (a native SecureStore/Keychain interaction, or true on-device timing), not a
device-count or data-shape issue in the grouping/settings logic itself.

### The one real, evidence-backed gap found
`loadFamilyCommandCenterConfig()` reads `SecureStore.getItemAsync` (`familyCommandCenterConfig.ts`)
with **no try/catch** — a SecureStore rejection makes the whole function's promise reject. Four call
sites called it as a bare `.then()` with **no `.catch()`**:

- `FamilyCommandCenterSettingsScreen.tsx` — the screen the settings gear icon opens.
- `DevicesTabScreen.tsx` — re-runs on every screen navigation (`[screen.name]` dependency,
  including the moment the gear icon is tapped) and is what decides `guestRestricted`, i.e.
  whether a phone is shown `GuestDeviceListScreen` instead of the normal Devices tab.
  `WhatLeavesYourHouseScreen.tsx`, `useTokenUpgradeBanner.ts` (mounted unconditionally on every
  Devices-tab render), and `ActivityEditorScreen.tsx` had the same gap.

This is not a hypothetical: **this exact household, today**, has a real, captured client-log entry
from Sean's own phone showing a SecureStore/Keychain read failing this way for a different
credential read:

```
"SonyBraviaDriver","Failed to reach Den TV at 192.168.1.217","meta":{"message":
"FunctionCallException: Calling the 'getValueWithKeyAsync' function has failed
(at ExpoModulesCore/AsyncFunctionDefinition.swift:123)
→ Caused by: KeyChainException: User interaction is not allowed.
(at ExpoSecureStore/SecureStoreModule.swift:168)"}
```
(from `~/.hearth-client-logs/9cdecc60-….jsonl` on the Pi, read-only, today's date). This confirms
the exact failure class — a Keychain access briefly denied, e.g. right after unlocking the phone or
while briefly backgrounded — really happens on this household's real hardware, for a SecureStore
read the web harness has no equivalent of (its `expo-secure-store` web shim never throws this way).
The codebase already has a defensive precedent for exactly this: `useNetworkDevices.ts` already does
`loadFamilyCommandCenterConfig().catch(() => null)`, confirming this rejection path is a known,
expected failure mode elsewhere — it just wasn't applied consistently everywhere the function is
called from a bare `.then()`.

**This is reported as a fix for a real code-quality gap with strong circumstantial evidence, not
as a confirmed root cause** — no crash was directly reproduced from it. Whether an unhandled
promise rejection alone is fatal in this app's release configuration is unconfirmed (no
global rejection handler was found in the codebase that would promote it to fatal); it is fixed
regardless because it is a genuine defect (the settings screen can silently fail to show
"already connected" state, and `guestRestricted` can go stale) independent of whether it is THE
crash.

### "Leah got kicked off"
Read-only investigation over SSH (Pi, `family-command-center` repo):
- `src/lib/hearth/auth.ts`: a legacy shared-token caller (no per-phone record) always resolves to
  role `"owner"`. `journalctl -u family-command-center.service` for today shows **both** Sean's and
  Leah's phones are still on the legacy shared `HEARTH_API_TOKEN` (neither has re-paired for a
  personal token yet) — confirmed also by their client-log files' `appVersion` fields
  (`9cdecc60-…` = `1.2.0+01a0e611`, today's build; `b1b1a43e-…` = `1.1.0+01a0e611`/`…e0ca`, an
  older build — Leah's phone had not picked up today's newest OTA update at the time of these
  entries). Neither phone can be restricted by role today; there is no guest-expiry or revocation
  in play for either.
- No 401/403 for either phone in today's service log; `~/.hearth-phone-tokens.json`-backed admin
  routes were not touched (read-only; no token was revoked, rotated, or otherwise modified).
- `family-command-center.service`, `hearth-relay-ws.service`, and `hearth-relay-vnc.service` were
  all restarted together at `17:06:38` today (consistent `Active: since` timestamps for all three —
  the known "stopping the main service also stops the relays" gotcha was handled correctly this
  time), almost certainly from deploying one of today's several merges. **A live LAN/relay
  connection Leah had open at that exact moment would have dropped** — the most plausible,
  evidence-backed explanation available, rather than a code bug in the app or the Pi's auth/role
  logic. This is a real but low-severity, expected side effect of same-day deploys, not something
  this investigation found a bug to fix for.
- No evidence was found of anything in the app that clears/wipes a saved `FamilyCommandCenterConfig`
  (`clearFamilyCommandCenterConfig()` is exported but has zero real call sites — only referenced by
  a test mock), so "kicked off" is not a local-storage-wipe bug.

## Decisions
1. **Fixed:** every bare `loadFamilyCommandCenterConfig().then(...)` with no error handling now has
   a `.catch()` that logs via `logger.warn` and leaves state as it was (never crashes, never treats
   a failed read as "not connected" when it might just be a transient Keychain hiccup) —
   `FamilyCommandCenterSettingsScreen.tsx`, `DevicesTabScreen.tsx`, `WhatLeavesYourHouseScreen.tsx`,
   `useTokenUpgradeBanner.ts`, `ActivityEditorScreen.tsx`. Matches the existing
   `useNetworkDevices.ts` precedent for the same call.
2. **Added test:** `familyCommandCenterConfig.test.ts` — `loadFamilyCommandCenterConfig` rejects
   (not silently null) when `SecureStore.getItemAsync` throws, documenting the contract every
   caller must now respect.
3. **Added permanent harness coverage:** `scripts/ui-verify/scenarios.mjs`'s
   `fcc-settings-large-household` scenario (fcc-settings + the 15+-device "types" household) stays
   in the suite so a future regression in that combination shows up as a `pageerror`.
4. **No component-render regression test was added** for the settings screen itself: this repo has
   no React Native component-test infra (no `@testing-library/react-native`, confirmed via
   `package.json`; existing hook tests like `useFccCameraPoll.test.ts` say so explicitly and test
   the extracted logic function instead). Adding that infra was out of scope for an urgent fix.
5. **Not fixed (no bug found):** device-type grouping (ADR-193), kid mode state, and the Pi's
   role/auth resolution are all already correct and already covered by tests for the exact edge
   cases named in the investigation brief.

## Consequences
- The settings-gear crash is **not conclusively explained**. The `.catch()` fixes close a real,
  evidence-backed gap (proven to occur in this household for a sibling SecureStore call today) but
  were not directly observed to be the crash's cause, since no crash was reproduced to test the fix
  against. If the crash recurs on a real phone after this fix ships, the next step is collecting an
  actual native stack trace (Sean tapping the gear icon with a debug build / TestFlight crash log
  attached, or Xcode device console) rather than further web-harness guessing — this was the
  explicit limit of what the web harness can observe (no Keychain, no real backgrounding).
- Also worth checking later, not done here (out of scope for a narrow fix): whether the Devices
  list or settings screen should virtualize (`FlatList`) instead of mapping every device to a
  `Switch`/row directly once a real household reaches 15-20 devices across cameras + Home
  Assistant entities — plausible on real hardware (memory/render cost), not something the web
  harness's Chromium process would show as a crash the way a memory-constrained phone might.
- "Leah got kicked off" is most likely explained by today's `17:06:38` service restart dropping a
  live connection, not a code defect; no code change was made for it. If it recurs outside a
  deploy window, that would point at something else and is worth a fresh look then.
