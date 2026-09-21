# ADR-HEARTH-115: Remove the "Recently Launched" apps row

**Date:** 2026-09-20
**Status:** Accepted, implemented

## Context

Sean, directly: "remove recently launched." This reverses the UI feature built in ADR-HEARTH-076
(Roku) and ADR-HEARTH-079 (LG) — no reason was given beyond the direct instruction, so this record
exists to note the reversal and its exact scope, per the standing ADR rule.

## Decision

Removed only the recency-tracking/UI layer, not the underlying live-app-catalog fetch:

- `UniversalTvRemote.tsx`: deleted the "Recently Launched" card, its `recentApps`/`installedApps`
  derived state, the `recentAppIds` state and its loading `useEffect`, and the
  `sendLaunchApp()` wrapper (its only remaining job — awaiting the result to call
  `recordAppLaunch`/`loadRecentApps` — no longer had a reason to exist; both call sites now call
  `send("launchApp", …)` directly, like every other capability).
- `src/runtime/recentAppsPersistence.ts` and its test deleted outright — confirmed via grep to have
  no other consumer anywhere in the codebase.
- **Deliberately left unchanged**: `RokuEcpDriver.ts`'s `refreshApps()`/`getApps()`
  (`/query/apps`) and `LgWebOsDriver.ts`'s `refreshApps()` (`listLaunchPoints`), which populate
  `state.values.apps` — the live installed-app catalog itself, plus `lastLaunchedAppId` on both
  drivers' `launchApp` results. Sean asked to remove the *recently-launched* feature specifically,
  not the app-catalog fetch — that catalog is real, tested, verified infrastructure with no other
  bug, and ADR-076 already flagged a still-open, real follow-up (a full "browse all installed
  apps" screen) that would want exactly this data. Removing it now would be deleting working
  infrastructure for a feature that was never actually asked to go, only speculatively cleaning up
  ahead of a need that doesn't exist yet — the opposite of this project's own
  no-premature-cleanup principle.

## Consequences

- The Devices/Remote screen no longer shows a "Recently Launched" row for any device, on any
  build.
- `state.values.apps` and `lastLaunchedAppId` remain populated on Roku/LG but are currently
  unconsumed by any UI — an intentional, disclosed gap, not a bug, until/unless a future
  browse-all-apps feature (or a reintroduced recency row) uses it again.
- `npx tsc --noEmit` clean; full suite passing (recentAppsPersistence.test.ts's own tests removed
  along with the module, not left stubbed out).
