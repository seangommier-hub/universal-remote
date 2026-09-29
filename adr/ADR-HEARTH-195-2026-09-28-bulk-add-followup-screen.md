# ADR-HEARTH-195: A summary card for what "Add all" just added

**Date:** 2026-09-28
**Status:** Accepted, implemented

## Context

ADR-HEARTH-167's own report named a gap: "Bulk-added devices skip the naming and wake-test screen,
so people finish that from each device." `onAddedQuietly` deliberately keeps "Add all" on the
Discover screen instead of navigating anywhere (ADR-HEARTH-167 decision 1), so the fix cannot be
"show `PostAddScreen` once per added device" — a loop of full-screen forms is exactly the tedium
"Add all" exists to remove.

## Decision

- When a run of "Add all ready" finishes with at least one device added, `AddAllCard` replaces its
  plain "Done" button with a new `BulkAddSummaryCard`: one compact card listing every device that
  run just added, its auto-detected name editable in place (tap the name, a `TextInput` replaces it,
  Enter or blur commits), and one **"Test wake for all"** button, instead of a `PostAddScreen` per
  device. **"Skip, I'll do this later"** is always present and closes the card. A run that added
  nothing (everything failed or needed a step) keeps the old plain "Done" button — there is nothing
  to name or test.
- `src/ui/batchWakeTest.ts` (`runBatchWakeTest`) reuses `WakeTestRunner` unchanged — one runner
  per device, run to a terminal phase, one device at a time (the same one-at-a-time rationale as
  "Add all" itself, ADR-HEARTH-167: a burst of wake packets and state subscriptions would race on
  the Pi). A device with no `powerOn`/`power` capability is skipped without ever touching the
  network; a device that already reads as connected (the common case right after "Add all", since a
  freshly connected device looks "on") is reported "Already on — skipped" rather than failed. Per-row
  result is `pass` / `fail` / `skip`, shown inline under that device's name.
- `src/ui/useBulkFollowup.ts` is the small hook wiring this together (present/close the card, start
  and commit an inline rename via `nameToCommit` in `src/ui/bulkFollowupNaming.ts`, drive the batch
  test) — kept separate from `useAddAll.ts`/`addAllRunner.ts` (the connect run itself is untouched)
  per the project's one-job-per-module rule.
- `useAddAll` gained one optional hook, `onDone(summary)`, called once a run finishes; `DiscoverDevicesScreen`
  uses it to open the summary card only when `summary.added.length > 0`, and wires a `commandEngine`
  prop and an `onRenameDevice` prop (both threaded down from `DevicesTabScreen`/`App.tsx`, the same
  `onRenameDevice` every other rename entry point already calls) — nothing new to persist.
- Devices added one at a time through the normal add flow are unchanged: `handleAdded` still opens
  `PostAddScreen` exactly as before (ADR-HEARTH-154). This ADR only changes what happens after a bulk
  run.

## Verification

`src/ui/batchWakeTest.test.ts` and `src/ui/bulkFollowupNaming.test.ts` cover the new pure logic
(skip-without-network, still-on skip, send-failure, timeout, one-at-a-time ordering; trim/no-op
rename rules). `useBulkFollowup.ts` itself is a thin hook with no independent test, the same
convention `useAddAll.ts` already follows in this codebase.

Web harness: added `discover-add-all-followup-wake-test` (`scripts/ui-verify/scenarios.mjs`) —
clicks "Add all 4", waits for it to finish, then clicks "Test wake for all". The demo's four
auto-added brands (Chromecast, Roku, Sonos, Yamaha) already give the mix this needed: only the
Yamaha driver declares `power`, so the other three skip with "No power-on command for this device."
and the Yamaha row skips with "Already on — skipped." (it really is connected by then) — a real
pass/fail render depends on a device that connects but currently reads disconnected, not reproducible
in the static demo fixture. No overflow at 393x852 (matches `discover-add-all-done`'s own result).

## Not done

The demo fixture cannot show an actual pass or fail row (every demo driver reports "connected"
immediately after connecting) — only real hardware exercises those two branches; `batchWakeTest.test.ts`
covers them directly instead. No "cancel" for a wake test already in progress across the batch (the
per-row wait is the same 60 s ceiling as the single-device `WakeTestPanel`, and "Add all" itself has
the same no-cancel-mid-row limitation already accepted in ADR-HEARTH-167).
