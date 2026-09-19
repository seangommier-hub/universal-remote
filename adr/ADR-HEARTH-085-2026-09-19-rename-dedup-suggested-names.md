# ADR-HEARTH-085: Discoverable rename, duplicate-device prevention, real device names as suggestions

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Sean: "the ability to rename devices and prevent duplicates needs to exist, as well as suggested
names based on the device it thinks it is, i know that these devices are named internally and that
info is available when connecting over wifi." Investigated the existing architecture before
building anything (a background research pass, cross-checked directly rather than trusted blind):

- **Rename already existed** — but only as an inline tap-to-edit on a device's own remote screen
  header (`UniversalTvRemote.tsx`/`LightControlScreen.tsx`, `onRename` wired to
  `App.tsx`'s `handleRenameDevice`), not reachable from the device list itself. The research pass
  missed this (its `grep -rn "rename"` search didn't surface `onRename`/`handleRenameDevice`) —
  caught by reading the actual wiring before design, not trusting the report at face value.
- **Duplicate prevention did not exist.** `DeviceRegistry`/`saveDevice` only dedupe on exact `id`
  match; nothing compared identity across ids. `hwaddr` is already the de facto stable identity key
  discovery uses (`FamilyCommandCenterDiscoveryProvider`'s `fcc-${hwaddr}` id,
  `LgWebOsDriver`'s MAC-based re-discovery) but was never checked against the *existing* device
  list before adding a new one.
- **A discovered device's `name` already came from something "internal"** — the DHCP hostname
  Family Command Center reports — but a driver's own real, human-set name (distinct from a DHCP
  hostname) was never fetched at all for any driver.
- **A real, silent bug**: `familyCommandCenterDeviceLookup.ts` already documents that a device with
  no `hwaddr` re-locates itself after an IP change by matching its saved `name` against the
  Center's inventory (`findCurrentIpByName`) — `handleRenameDevice` never backfilled `hwaddr`,
  meaning renaming such a device would silently break that fallback forever.

## Decision

1. **Rename surfaced from the device list.** `DeviceListScreen`'s long-press menu gets a "Rename"
   option alongside Edit address/Remove, opening a new `RenameDeviceScreen.tsx` (mirrors
   `EditDeviceAddressScreen.tsx`'s shape). Adding a 4th option pushed this past Android's
   `Alert.alert` 3-button cap (the same real bug already found and fixed in
   `DiscoverDevicesScreen.tsx`'s brand picker) — converted the whole action sheet to a custom
   `Modal`, not just added the option, to avoid silently reintroducing that exact bug on Android.
2. **`handleRenameDevice` now backfills `hwaddr`** the same way `EditDeviceAddressScreen` already
   does (`findMacByIp`) when it's missing — neutralizing the reconnect-fallback bug above.
3. **Duplicate prevention at `handleDeviceAdded`** (the one choke point every add path — Discover,
   every manual Add*Screen — already shares): a new device whose `hwaddr` matches an
   already-registered device's is treated as the same physical device. Its existing id/name/room
   are kept (preserving any rename), only connection info refreshes — no second card. A device with
   no `hwaddr` (any manually-added one without a backfilled one yet) can't be checked this way and
   is added as before — no regression, just no new protection for that case either.
4. **Roku's real device name, verified and surfaced as a suggestion.** `RokuEcpClient.getDeviceInfo()`
   already fetches `/query/device-info` for power/model — verified directly against
   `ctalkington/python-rokuecp`'s `Info.from_dict` (`models.py`) that `user-device-name` is the
   actual "Name your Roku" setting, with `friendly-device-name` (Roku's own generated default) as
   the fallback when a user never set one. Patched into live state as `deviceName` at connect time —
   no extra network call, the read already happens. `DiscoverDevicesScreen` now reads
   `stateStore.get(device.id).values.deviceName` right after `driver.connect()` succeeds and prefers
   it over the generic DHCP hostname when saving the device for the first time. Never touches an
   already-saved `Device.name` — this only shapes the initial suggestion.

## Scope: only Roku's real name is wired up

LG/Samsung/Sony/Kasa/SmartThings have no equivalent fetch today — confirmed by the same research
pass, not assumed. Deliberately not expanded to those this pass, the same "verified now, flagged
honestly as a follow-up" scoping ADR-HEARTH-076 already established for LG's recent-apps feature.
Each would need its own primary-source verification of the real field name before writing code,
same discipline applied to Roku here.

## Verification

New/updated tests: `RokuEcpClient.test.ts` (user-device-name preferred, friendly-device-name
fallback, undefined when neither present), `RokuEcpDriver.test.ts` (`state.values.deviceName`
populated at connect). The rename/dedup logic in `App.tsx` has no dedicated test coverage — this
project has no existing test convention for its root composition component or screen-level UI
(confirmed no `App.test.tsx` or screen `.test.tsx` files exist anywhere), so none was invented for
this change alone; verified instead via `tsc --noEmit` and the full existing suite staying green.
Full suite: 34 suites / 361 tests passing, `tsc --noEmit` clean.

## Consequences

- A household's device list stays clean even if the same physical device gets discovered or added
  more than once — the common real trigger being a device re-appearing after an IP change slightly
  faster than its own driver's reconnect logic catches up.
- Renaming a manually-added, hwaddr-less device now silently strengthens it (backfills `hwaddr` if
  the current IP resolves to one) rather than leaving a latent, undocumented fragility in place.
- Roku households get a meaningfully better default name the first time a device is added, with no
  extra tap or confirmation step — LG/Samsung/Sony/Kasa/SmartThings remain on the DHCP-hostname
  default until their own protocols are researched the same way.
