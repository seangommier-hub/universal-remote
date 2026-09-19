# ADR-HEARTH-086: In-app update check — manual button and automatic banner

**Date:** 2026-09-19
**Status:** Accepted, implemented; ships via the EAS Update channel it enables

## Context

Right after ADR-HEARTH-084 configured EAS Update, Sean asked: "is there an update function that is
both a true update button in the test/dev environment and then a way to push updates for download
when it is live publicly." `expo-updates`'s JS API already covers both: `checkForUpdateAsync()` /
`fetchUpdateAsync()` for an explicit manual check, and the same calls run automatically (on launch
and on foreground-resume) for a passive experience.

## Decision

- `src/runtime/appUpdates.ts`: a small, no-UI wrapper (`checkAndDownloadUpdateAsync`,
  `applyDownloadedUpdateAsync`) around the imperative `expo-updates` API. Never throws —
  `Updates.isEnabled` is false in Expo Go or any build predating ADR-HEARTH-084, and a transient
  network failure during a routine background check shouldn't be treated differently than "nothing
  to do right now."
- **Automatic check** on app launch and on returning to foreground (reusing the existing
  `AppState` listener already there for device reconnects, ADR-HEARTH-017) — stays silent unless it
  actually finds and downloads something, so opening the app doesn't flash a banner nearly every
  time for no reason.
- **Manual "Check for Updates" button** — a new icon in `DeviceListScreen`'s header, next to the
  existing Family Command Center buttons — always gives visible feedback: checking, "up to date"
  (auto-dismisses after 2.5s), an error, or a persistent "ready to restart" banner. This is
  specifically Sean's "true update button" ask — the automatic path alone wouldn't give that
  positive confirmation.
- `UpdateBanner.tsx`: never auto-applies a downloaded update — the same reasoning ADR-HEARTH-017
  already applied to reconnects, a device mid-command shouldn't get yanked into a reload without the
  user choosing the moment. "Restart Now" is a deliberate tap, always.

## Consequences

- This entire feature is pure JS/UI — no native additions beyond what ADR-HEARTH-084 already
  installed — so it ships to already-updated-enabled builds via `eas update`, not a new binary.
- The manual button's "up to date"/"error" states only ever come from an explicit tap; the
  automatic background check can silently fail (logged, not surfaced) without alarming the user
  over a transient blip during ordinary app use.
- Full suite (34/363) and `tsc --noEmit` stay clean — no new tests were added for this UI (matching
  ADR-HEARTH-085's same note: this project has no test convention for screen-level UI/App.tsx),
  verified structurally instead.
