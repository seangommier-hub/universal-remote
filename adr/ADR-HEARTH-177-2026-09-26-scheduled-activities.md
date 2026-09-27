# ADR-HEARTH-177: Scheduled Activities (run on the Pi with no phone open)

Date: 2026-09-26
Status: Accepted. Pairs with Family Command Center adr/0201. Implements ADR-HEARTH-158 item 7 and ADR-HEARTH-174 Track B item 4, promoting the ADR-HEARTH-151 spike.

## Context
"Bedtime: turn off Den TV and Luca's TV at 8:30 pm on school nights" needs something to run when every phone is asleep. Only the Pi is always on, and it can drive devices only through the headless runner (ADR-151).

## Decisions
1. **Schedules live on the Activity**, not in the separate `triggers` store. `Activity.schedules?: { id, days[0..6, 0=Sunday], at: "HH:MM", enabled }[]` (max 10). One versioned PUT saves steps and schedules together, so a conflict (409) covers both. The old `triggers` routes stay (unused).
   - Question: reuse the ADR-0193 `Trigger` store or extend Activity? Answer: extend Activity. Rationale: atomic with the steps, optimistic concurrency for free, no orphaned triggers.
2. **Backward compatible.** A PUT without `schedules` keeps the stored ones (an older phone editing a name cannot wipe them); `schedules: []` clears them. `normalizeActivity` preserves the field; activities without it are unchanged.
3. **Timezone is the Pi's.** The editor says so; no per-schedule zone.
4. **Editor**: optional "Schedule" section, one card per schedule (time field that accepts "8:30 pm" or "20:30", seven day chips, on/off switch, "Next: ..." line, remove), "Add a schedule". A schedule with no days blocks Save. If any step cannot run unattended the section lists each one ("Step 3 will be skipped on a schedule: ...").
5. **What runs unattended is an explicit allow-list** (`src/core/activities/headlessSupport.ts`, shared by the editor and the runner): drivers `lg-webos-wss3001`, `sony-bravia`, `roku-ecp`, `kasa-plug`, `shelly-relay`; command steps `powerOff` and `power` only; `delay` always; `waitFor` on those drivers. Anything else is skipped and reported per step ("Skipped: samsung-tizen devices cannot run on a schedule yet"), never dropped silently. Rationale: ADR-151's own advice (explicit allow-list of device+capability); the blast radius of an unattended run is turning things off.
6. **`power` is a toggle, so it is guarded**: the runner sends it only if the device state is freshly (under 90 s) confirmed "on"; "off" means "Already off, nothing sent" (reported as skipped); unknown or stale state fails without sending. A schedule can therefore turn a device off but never on by toggling. Sony (only `power`, no `powerOff`) and Kasa/Shelly (only `power`) depend on this. Decided without asking Sean (the request was for kids' TVs off); revisit if he wants scheduled power-on.
7. **The runner is promoted**, not rewritten: `runner/activityExecution.ts` runs the existing `runActivity` (same step semantics as the phone) through `DeviceExecutor`; `POST /run-activity` on the loopback API; optional shared secret header `x-hearth-runner-secret`. The bundle had bit-rotted since the spike (bootstrap now pulls `react-native` `Platform` and demo mode); fixed with a `Platform` shim and a `saveFamilyCommandCenterConfig` stub.
8. **Bug found and fixed on the way**: `putActivity` posted the whole activity (`id`, `version`, `updatedAt` included) to a strict Pi schema, which answers 400. The live Pi had zero activities, i.e. sync had never worked. The client now sends only editable fields plus `baseVersion`; the Pi also tolerates the three legacy keys.
9. Cause is encoded in text ("Bedtime (schedule)", run `by: "Schedule"`) because ADR-176's cause field is not merged.

## Verification
Jest: schedule time (12/24h typing, DST gap and fold, midnight and month rollover, days), model (normalize, validate, backward compat), headless allow-list, runner execution (skips reported, toggle guard, connect failure), runner HTTP (secret, run-activity). Web harness scenario `activity-editor-schedule` (scripts/ui-verify).

## Known limits
- Only drivers on the allow-list, only power off. Roku "Luca's Office" is on another subnet (10.20.30.x); reachability from the Pi is unverified.
- Per-driver live power-off through the runner was not exercised on Sean's TVs (deliberately); LG was proven in ADR-151.
- The runner bundle is built here and copied to `~/hearth-runner/hearth-runner.cjs` on the Pi by hand; there is no CI or deploy hook for it yet.
- The phone does not yet show "missed" or "paused" runs specially; they appear in run history as skipped steps and in the household log.
