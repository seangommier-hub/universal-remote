# ADR-HEARTH-124: A direct path to Family Command Center settings once already configured

**Date:** 2026-09-21
**Status:** Accepted, implemented

## Context

Sean, directly, immediately after ADR-HEARTH-123 shipped: "there is no settings there."

Investigated the actual navigation graph rather than guessing. `FamilyCommandCenterSettingsScreen`
(the screen with the new "Public address" field) was only ever reachable one way: the header's
"Connect Family Command Center" button always opened `ScanFamilyCommandCenterQrScreen` — a camera
QR-scanner meant for *first-time* pairing — which has a "manual entry" text link buried inside it
that finally reaches the real settings screen. For a household that's already paired (Sean's, for
the entire duration of this session), there was no direct way back into settings at all. "Open the
camera to reach settings you already have" isn't something a user would ever find on their own —
his report was accurate, not a bug in the new feature itself.

## Decision

`DevicesTabScreen.tsx` now tracks whether Family Command Center is configured
(`loadFamilyCommandCenterConfig() !== null`, checked on mount and re-checked on every screen
change) and routes the header button accordingly: `fcc-settings` directly when already configured,
the original `fcc-scan` QR flow only for genuine first-time setup. `DeviceListScreen.tsx`'s button
reflects this too — a settings gear icon and "Family Command Center settings" label when
configured, the original link icon and "Connect Family Command Center" label when not.

Also fixed `FamilyCommandCenterSettingsScreen`'s own `onSaved` destination: it used to always
advance to the Discover Devices screen, which made sense for its one prior entry point (finish
first-time pairing → naturally go discover devices) but would be a surprising detour for someone
who just navigated here directly to edit an existing setup. Now returns to the device list, same
as Cancel.

## Consequences

- The exact reported symptom is fixed: tapping the header button when Family Command Center is
  already configured now opens settings directly — no camera, no buried link.
- First-time setup (the QR-scan pairing flow) is completely unchanged.
- `npx tsc --noEmit` clean; full suite 956/956 passing — pure navigation/UI wiring, no dedicated
  test file for these screens exists (this project's established convention for screen-level
  components), verified by typecheck + full regression run.
- `DiscoverDevicesScreen`'s own separate, inline "open settings" prompt (shown when Family Command
  Center isn't configured yet, encountered while trying to discover devices) still routes to the
  QR-scan flow — left unchanged, since reaching that prompt already implies "not configured yet,"
  the correct case for pairing rather than editing.
