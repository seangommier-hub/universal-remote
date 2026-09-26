# ADR-HEARTH-150: Household Activities (multi-step, synced) replace Scenes

Date: 2026-09-26
Status: Accepted (supersedes the run/storage design of ADR-HEARTH-056/058/059/061/073; their UX ideas carry over)

## Context
Scenes were an ordered list of `{deviceId, capability, args}` with no delays, no wait-for-state, no retry, and lived in one phone's AsyncStorage, so a "Movie Night" made on one phone never reached another household phone. A real Movie Night is: TV on, wait until it is really on, set input, set volume, receiver on (Logitech Harmony's Activities model).

## Decision
- **Model** (`src/core/types/Activity.ts`): `Activity { id, name(1..80), icon?, steps (max 50), version, updatedAt, updatedBy? }`. Steps: `command` (optional `onFail`: continue | stop | retry:1..3), `delay` (0..600000 ms), `waitFor` (deviceId, stateKey, equals, timeoutMs 1000..120000, optional `onTimeout`: continue | stop). `Trigger { id, activityId, kind:"time", at, days, enabled }`.
- **Migration** (`activityModel.ts`, `activityPersistence.ts`): saved Scenes load as Activities of command steps only (args preserved), version 0, marked for upload. New storage key `hearth.activities.v1`; the legacy `hearth.scenes` key is read once and never modified or deleted, so nothing can be lost.
- **Runner** (`activityRunner.ts`), sequential through the existing CommandEngine, never throws, cancellable via AbortSignal, per-step `{index, status ok|failed|skipped, error?}`. `delay` is an abortable timer. `waitFor` polls the StateStore every 500 ms. Backoff for retries is 750 ms times the attempt number.
- **Retry safety:** the CommandEngine converts thrown driver errors into a failed result, so "failed before send" cannot be told from "sent then failed". Rule: an engine call that actually threw is always retryable; a failed result is retried only if it is `driver_error` and the capability is idempotent. Toggle/relative capabilities (`power`, `mute`, `playPause`, `selectPlayPause`, `sleepTimer`, `volumeUp/Down`, `channelUp/Down`, `openSourceList`, `dispense`) are never re-sent after a failed result, so a stale power toggle cannot be sent twice.
- **Failure defaults:** command `onFail` defaults to `continue` (matches old Scene behaviour). A step whose retries are exhausted, or `stop`, skips every remaining step. `waitFor.onTimeout` defaults to `stop` (do not set the input on a TV that never turned on); the Pi runner should use the same defaults.
- **Retry failed steps:** re-runs failed steps plus steps skipped after a stop/cancel, in order, with the same `runId`, and merges the results.
- **Run id:** a UUID per run, reused for retries, so the Pi upserts instead of duplicating.
- **Sync** (`familyCommandCenterActivities.ts`, `activitySync.ts`, `activityLocalState.ts`) over the shared LAN-then-public `fccFetch`. `version` on a phone is the last server version its copy is based on. Local edits are tracked in `dirtyIds`; local deletes of anything the Pi has seen in `pendingDeleteIds`. Sync: fetch snapshot; flush pending deletes; take newer server copies of unedited activities; upload edits with `baseVersion`; on 409 keep the server copy and tell the user by name; upload activities the Pi has never seen with base version 0; drop synced activities that vanished from the Pi (deleted elsewhere). Triggers are server-authoritative (fetched and stored; no editor yet). Unreachable Pi (classified with `classifyNetworkFailure`) or 404 leaves local state untouched: local-only, no error shown. A 409 body may be the bare activity or `{activity}`.
- **History:** each finished run is POSTed to `activity-runs` (failure is logged and ignored); the last 10 come from `GET activity-runs` and the home screen shows three as "Movie Night ran 9:02 PM by Leah, 1 step failed". "By" is a per-phone name saved locally (`hearth.household.memberName`), edited at the bottom of the activity editor; blank shows "someone".
- **UI:** `CreateSceneScreen` became `ActivityEditorScreen` (add, remove, reorder steps; pickers built from each device's declared capabilities, live inputs, launchApp, setVolume presets; delay/wait/failure options per step; Test run; inline results). `ActivityResultsCard` shows ok/failed/skipped with "Retry failed steps"; home-screen runs show a results modal only when something did not finish. The home chip shows `name 2/5` while running and a tap stops the run. `DeviceListScreen` change is limited to the activities chip row and history lines. `UniversalTvRemote.tsx` untouched.
- **Removed:** `sceneRunner.ts` (+test), `scenePersistence.ts`; their sequencing, failure-isolation and retry-failed behaviours are covered in `activityRunner.test.ts`.

## Pi routes this depends on (`/api/integrations/hearth/...`)
`GET activities`, `PUT/DELETE activities/{id}` (PUT body includes `baseVersion`, 409 returns the current copy), `PUT/DELETE triggers/{id}`, `POST activity-runs`, `GET activity-runs?limit=`. Until they exist the app behaves exactly as local-only activities.

## Questions and answers (ADR-GLOBAL-002)
- Q: Retry on `driver_error` when the engine hides thrown vs failed? A: retry only idempotent capabilities (above); toggles never. Rationale: correctness over convenience.
- Q: Default `waitFor.onTimeout`? A: `stop`. Rationale: later steps assume the awaited state.
