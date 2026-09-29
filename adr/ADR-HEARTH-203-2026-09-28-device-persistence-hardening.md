# ADR-HEARTH-203: Device persistence hardening — Keychain-unavailable reads, and one bad read no longer drops the whole device list

**Date:** 2026-09-28
**Status:** Accepted, implemented, tested
**Priority:** Sean, directly: "the persistence of the devices is a huge priority."

## Context

Real client logs from Sean's own phone (client `b1b1a43e`, today) captured:

```
"SonyBraviaDriver","Failed to reach Den TV at 192.168.1.217","meta":{"message":
"FunctionCallException: Calling the 'getValueWithKeyAsync' function has failed
(at ExpoModulesCore/AsyncFunctionDefinition.swift:123)
→ Caused by: KeyChainException: User interaction is not allowed.
(at ExpoSecureStore/SecureStoreModule.swift:168)"}
```

iOS refuses Keychain reads while the phone is locked or the app is backgrounded. ADR-HEARTH-196
(merged earlier today) hardened five UI-level call sites of `loadFamilyCommandCenterConfig()` with
`.catch()`, but explicitly did not audit the driver/reconnect layer where this exact failure was
logged. This ADR is that audit, for both halves of "device persistence": (A) the connection staying
up/reconnecting, and (B) the saved device list itself never silently losing a device or a field.

Per ADR-GLOBAL-008/003: checked memory and existing patterns before designing a fix, and fixed the
shared chokepoint every driver already funnels through rather than duplicating a check across many
files.

## Investigation — tracing the exact log line

The log's message text is produced by `SonyBraviaDriver.refreshState()`'s catch block
(`Failed to reach ${device.name} at ${device.config?.ipAddress}`, `message: err.message`). Read
`SonyBraviaDriver.ts` end to end to find what `err` actually was:

1. `refreshState()` calls `fetchLiveStateWithSelfHeal()`.
2. On the primary REST read failing (any reason — a real network blip, an iOS-suspended socket
   while backgrounded, etc.), that function calls `findMovedAddress(device)`
   (`src/drivers/shared/selfHeal.ts`) to ask Family Command Center whether the TV is now at a
   different address.
3. `findMovedAddress` → `findCurrentIpByMac`/`findCurrentIpByName`/`findCurrentIpByUuid` →
   `fetchLanDevices()` (`src/discovery/familyCommandCenterDeviceLookup.ts`) → **`await
   loadFamilyCommandCenterConfig()`, with no try/catch** → `SecureStore.getItemAsync` throws the
   KeyChainException.
4. That throw was **not** caught anywhere in `familyCommandCenterDeviceLookup.ts`, even though
   every function in that file is documented "never throws, returns undefined for not found" (and
   is tested that way for "not configured" and "request failed" — just not for "config unreadable
   right now"). It propagated out of `findMovedAddress`, past `fetchLiveStateWithSelfHeal`'s own
   `if (!freshIp...) throw err` (which never runs — the *self-heal* error is what's thrown, not the
   original reachability error), and became the `err` that `refreshState()`'s catch logged and
   acted on.

**Every driver that self-heals shares this exact chokepoint** — `findMovedAddress`/
`findCurrentIpByMac`/`findCurrentIpByName`/`findCurrentIpByUuid`/`findCurrentIpByBrand` are all in
one file, called from `PerRequestDriver.ts` (Vizio/Wiz/LIFX/Shelly), `LgWebOsDriver.ts`,
`SamsungTizenDriver.ts`, `SonyBraviaDriver.ts`, and directly from `SonosDriver.ts`,
`KasaPlugDriver.ts`, `ChromecastDriver.ts`, `RokuEcpDriver.ts`, `AndroidTvDriver.ts`,
`AppleTvDriver.ts`, `DenonDriver.ts`, `YamahaMusicCastDriver.ts` — the full list of drivers with
MAC-based self-healing (ADR-HEARTH-017/109/119/126).

## Decision — (A) connection persistence

**Fixed at the one shared chokepoint, not duplicated across the ~13 driver files that call it**
(ADR-GLOBAL-003: one real fix belongs in one shared place, matching how `selfHeal.ts` already
consolidates this exact lookup logic instead of copying it per driver):

1. **New:** `src/core/network/isKeychainUnavailable.ts` — `isKeychainUnavailable(error)`, matching
   `KeyChainException` / "User interaction is not allowed" in the error text (defensive substring
   match; expo-secure-store has no distinct error class for this). Reusable by any future call site.
2. **`src/discovery/familyCommandCenterDeviceLookup.ts`:** both places that call
   `loadFamilyCommandCenterConfig()` (`fetchLanDevices()`, used by every MAC/UUID/name lookup, and
   `findCurrentIpByBrand()`) now go through a new `loadConfigSafely()` that catches the rejection,
   logs at `debug` (Keychain-unavailable — expected, will just retry) or `warn` (anything else) via
   `isKeychainUnavailable`, and returns `null` either way. This restores the file's own documented
   "never throws" contract, which a SecureStore/Keychain failure was silently breaking.

**Why this is sufficient, and no new per-driver AppState hook was added:** self-heal only ever runs
*after* a primary reachability read has already failed — it never is, on its own, the reason a
device gets marked disconnected. Before this fix, a Keychain hiccup during self-heal **masked the
real failure's message and both the primary retry-mechanisms — normal backoff and the existing
`AppState`-driven immediate reconnect (`App.tsx`'s foreground listener → `reconnectAllDevices()`,
ADR-HEARTH-017's "app-background gap" fix) — were unaffected either way**, since self-heal's own
outcome was never load-bearing for whether a retry gets scheduled. The real, concrete bugs this
fixes are: (1) a misleading log (a Keychain hiccup being reported as "the TV" being unreachable),
and (2) self-heal permanently giving up on relocating a genuinely-moved device for that one attempt
instead of quietly deferring — both fixed by restoring the "never throws" contract at its single
source. The task brief's "retry once foregrounded rather than backoff" behavior already exists
globally (every device, not just a self-heal-affected one, gets reconnected immediately on the
next foreground transition) — confirmed by reading `App.tsx` and ADR-HEARTH-017, not assumed.

**Checked, no change needed:**
- `haInstanceStore.ts`/`haOAuthStateStore.ts`'s `hydrateHaInstances()`/`hydrateHaOAuthStates()`
  already catch per-instance and log (pre-existing, correct). Home Assistant's live reconnect path
  reuses the in-memory token/instance registry — it does not re-read SecureStore per reconnect, so
  there is no live-reconnect Keychain exposure to fix there.
- `LgWebOsDriver`/`SamsungTizenDriver`/`SonyBraviaDriver`'s own connect/refresh paths do not read
  SecureStore directly (device secrets are rehydrated once at startup onto the in-memory `Device`
  object) — the only live SecureStore read in the whole reconnect path, for every driver, is the
  self-heal lookup fixed above.

## Decision — (B) data persistence (`src/runtime/persistence.ts`)

1. **Real bug found and fixed: `loadDevices()` dropped every saved device, not just one, on a
   single Keychain hiccup.** Each device's sensitive-field rehydration ran inside one outer
   `Promise.all`; one field on one device throwing rejected the whole call. `App.tsx`'s own startup
   catch (already there, with a comment anticipating exactly this class of failure) then started
   the session with an **empty device list** — every device the household has, gone from the UI
   for that session, even though nothing was actually lost from storage. Fixed: each field read is
   now independently try/caught (`rehydrateDevice`); a failure leaves just that field un-rehydrated
   (logged via `isKeychainUnavailable`, `debug` vs `warn`) and every device — including the one with
   the failing field — still comes back.
2. **Real (smaller) bug found and fixed: `removeDevice()` could reject after already removing the
   device from the visible list**, if one of its four `SecureStore.deleteItemAsync` calls (only one
   of which typically applies) threw. The list write (the part the user's "Remove" tap is actually
   for) already happened by the time this fires. Fixed the same way as `haOAuthStateStore.ts`'s
   existing `clearHaOAuthState()` precedent: each delete is independent and never throws;
   `removeDevice()` always resolves once the list write succeeds.
3. **Checked, no bug found — partial write between a device's record and its secret
   (`writeDevice()`):** sensitive fields are written to SecureStore *before* the device list is
   written to AsyncStorage, and the whole function throws if that SecureStore write fails — so a
   device is never persisted to the list without its secret already having been saved first. This
   ordering was already correct; not changed.
4. **Checked, no bug found — `deleteDeviceSecret()` (used by `haDeviceMigration.ts`):** its one
   caller already wraps it in a per-device try/catch and falls back to the pre-migration device on
   any failure, and ADR-HEARTH-175's own migration order (instance, then device, then old secret
   last) means an interrupted migration is safe to repeat next launch — confirmed by reading
   `haDeviceMigration.ts`, not assumed.
5. **Checked, no bug found — the layout store (`hearth.deviceLayout.v1`, ADR-173/193) and activity
   storage (`hearth.activities.v1`):** `normalizeLayout()` and `normalizeActivityList()` already
   normalize per-entry (a bad room name, a bad activity) rather than failing the whole record;
   `loadDeviceLayout()`/`loadActivityState()` already catch a top-level parse failure and degrade to
   empty rather than throwing. Neither uses SecureStore. Not changed.
6. **Checked, no bug found — kid-mode settings (`hearth.kidMode.v1`, AsyncStorage) and
   `KidPinVault`'s PIN/lockout records (SecureStore-backed):** `initKidMode()` already catches and
   defaults to off. `KidPinVault` is only ever touched from an in-foreground settings/PIN-entry flow
   (the user is actively looking at and typing into the screen), not from the background reconnect
   path this ADR is about — left as-is rather than speculatively hardening a path this investigation
   found no evidence of hitting the real failure mode.
7. **Confirmed the ADR-HEARTH-175 save queue holds up under real concurrency**, not just by reading
   the code: added a stress test that fires 25 overlapping `saveDevice()` calls and asserts every
   one lands in the final stored list — none lost to a racing read-modify-write.

## Testing

- New: `src/core/network/isKeychainUnavailable.test.ts` (6 cases: the real captured error text,
  case-insensitivity, plain strings, genuine network failures, `undefined`/`null`).
- `src/discovery/familyCommandCenterDeviceLookup.test.ts`: 3 new tests — `findCurrentIpByMac` and
  `findCurrentIpByBrand` both resolve `undefined` (not a throw) when
  `loadFamilyCommandCenterConfig()` rejects with a Keychain error, and `findCurrentIpByMac` does the
  same for an unrelated rejection reason.
- `src/runtime/persistence.test.ts`: 4 new tests — `loadDevices` keeps every device (including the
  one with the failing field) when one device's field throws with a Keychain error; `loadDevices`
  doesn't throw when every field on a device throws; `removeDevice` still removes the list entry
  when one SecureStore delete throws; 25 overlapping `saveDevice()` calls all land in the final
  list.
- `npx tsc --noEmit`: clean.
- `npx jest --silent --testPathIgnorePatterns="node_modules"` (node_modules junctioned in for this
  worktree, per memory `windows_portable_app_install_path`-adjacent tooling note): full suite green
  except `runner/shims/shims.test.ts` (pre-existing `ws` package/environment issue, out of scope,
  matches the task brief's own "ignore runner/shims") and one pre-existing flaky run of
  `SamsungTizenDriver.test.ts`'s re-discovery test (passed in isolation and in a different full-suite
  run; a real-timer test-pollution class already documented in ADR-HEARTH-126, not touched by this
  change — confirmed via `git status` that no Samsung file was modified here).

## Consequences

- A Keychain hiccup during self-heal (locked phone, backgrounded app) no longer masks the real
  reachability error's message, and no longer breaks `familyCommandCenterDeviceLookup.ts`'s own
  "never throws" contract.
- A single Keychain hiccup during app startup can no longer wipe the visible device list for a
  session — only the one field on the one device it actually affected is momentarily un-rehydrated
  (it rehydrates normally on the next `loadDevices()` call, e.g. app restart).
- `removeDevice()` can no longer reject after already having removed the device from the visible
  list.
- No driver's normal (non-Keychain) failure/backoff behavior changed — this is additive resilience
  at one shared chokepoint plus two persistence-layer robustness fixes, not a rewrite.
- Not done, deliberately: a bespoke per-driver `AppState`-triggered retry for the self-heal path.
  The existing global foreground-reconnect mechanism (ADR-HEARTH-017) already covers every device,
  including one affected by this; adding a second, narrower one would duplicate it for no behavioral
  gain and contradict ADR-GLOBAL-003's "don't add speculative complexity."
