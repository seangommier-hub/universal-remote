# ADR-HEARTH-176: Kid mode and log cause attribution

**Date:** 2026-09-26
**Status:** Accepted (built, OTA-only). Implements ADR-HEARTH-174 Track B items 1 and 2. Extends ADR-170 (activity log) and ADR-173 (layout store).

## Kid mode decisions
1. **Per phone, local.** `hearth.kidMode.v1` (AsyncStorage) holds `{ enabled, bedtime? }`, cached synchronously (`runtime/kidModeState.ts`) so log attribution never waits on storage. It survives app restarts, so killing the app does not escape it. Nothing syncs.
2. **Adult PIN, 4 digits.** Set the first time kid mode is turned on (entered twice); "Change PIN" in settings. Stored as `{ salt, hash }` in secure storage (`hearth.kidMode.pin.v1`): salt is a random UUID per set, hash is SHA-256 of `salt:pin`. The PIN itself is never stored or logged. A 4-digit space is small by nature; the protection is secure storage plus the lockout, not the hash strength.
3. **Lockout.** 5 wrong tries in a row refuse every PIN (including the right one) for 30 s; the count restarts; a correct PIN resets it. Lockout state is stored (`hearth.kidMode.lockout.v1`), so restarting does not reset it. Uses the phone clock.
4. **Forgot PIN.** Paste the household's Family Command Center token; if it equals this phone's saved token the PIN and lockout are cleared and kid mode turns off. A phone not connected to the household has no token, so its only recovery is reinstalling Hearth (which clears secure storage on iOS only on a full delete; documented limit).
5. **Which devices.** Long-press menu "Allowed in kid mode / Not allowed in kid mode", stored as `kidAllowed` in the ADR-173 layout record (local, pruned with removed devices, old records load with none). Default: no device is allowed, so enabling kid mode on a fresh setup shows "No devices are set up for kids yet."
6. **What kid mode shows.** A separate `KidDeviceListScreen` (not flags on the big list screen, ADR-GLOBAL-003): allowed devices only (favorites row, rooms, now-playing limited to allowed devices), remotes for allowed devices, a lock button that asks for the PIN. Hidden/unreachable: Add, Discover, suggested devices, Edit/Remove/Share/Rename/Room actions, FCC settings and setup screens, Command Center trackpad, update button, the whole Activities row and editor (an Activity can drive any device, so running one would bypass the allowed list; deliberate stricter reading), and the Feeder tab. `DevicesTabScreen` also forces any non-list, non-remote screen back to the list while restricted (a pair link cannot open Join).
7. **Attribution.** In kid mode a plain button press is logged as `Kid mode`, or `<phone name> (kid mode)` when this phone has a name (`runtime/loggedWho.ts`).
8. **Bedtime (optional).** Daily window in minutes since midnight, 24-hour text entry in settings, default 20:30-07:00; overnight windows supported; enforced only while kid mode is on, by the phone clock (30 s tick). During it the app shows a calm Bedtime screen instead of any tab, with a small "Grown-up? Leave kid mode" PIN link. Changing the phone clock defeats it (known limit; enforced locally by design).
9. **Loading.** The app shows its spinner until kid-mode settings are read, so an adult-visible list never flashes for a kid phone.

## Log cause decisions
10. **Cause is encoded in the existing `who` text; no Pi change.** The Pi schema (adr/0199) is strict, so adding a field risks a 422 on a whole batch from a phone ahead of the Pi. `core/activityLog/activityCause.ts` maps `person | activity | kid-mode | schedule | home-assistant` to text (`Movie night (Activity)`, `Kid mode`, `Leah's iPhone (kid mode)`, `Schedule`, `Bedtime (schedule)`, `Home Assistant`) and back (`causeOfWho`). Old entries read as `person`. Entry shape is unchanged (a test pins the keys). Pi adr/0201 is therefore not written; if a structured field is wanted later (filtering by cause on the Pi) that needs the Pi schema change first.
11. **Activity steps are now logged** (reverses ADR-170 decision 1 for Activities only): `CommandEngine.execute(cmd, { cause })` passes the cause to the observer; the runner sends `{ kind: "activity", name }` instead of `silent`. The 5 s repeat rule keeps one line per device/action. Wake tests stay silent.
12. Schedule and Home Assistant causes have no producer in the app yet (no schedules, HA changes are not observed); the type, wording and decoding exist so those features can attribute without another change.

## Verification
Jest: PIN policy, lockout, bedtime incl. overnight, kid status/settings, device filter, layout `kidAllowed` compatibility, vault (hash/salt, lockout, forgot PIN), cause mapping and recorder attribution, runner passes the activity cause. Web harness (demo, 393 wide) scenarios `kid-mode-list`, `kid-mode-pin-prompt`, `kid-mode-bedtime`, `kid-mode-create-pin`, `kid-mode-enabled-from-settings` screenshots checked.

## Not verified
Real phone, real secure-store persistence and expo-crypto hashing natively (web shim used), real bedtime clock rollover, the household-token reset against a live Pi, the Recent activity list showing Activity/kid lines from the live Pi.

## Questions asked and answered (ADR-GLOBAL-002)
Pi field vs text encoding: chosen by the task brief's fallback and the strict schema risk. Whether Activities run in kid mode: hidden (safer); revisit if Leah wants kids to run allowed-only Activities.
