# ADR-HEARTH-207: Settings crash, round two. Contain render errors, stop restarting the motion sensor, leave breadcrumbs

Date: 2026-10-05
Status: Accepted. Root cause still not proven; see Consequences.
Follows: ADR-HEARTH-196 (first investigation, 2026-09-28)

## Context
Sean, 2026-10-05: "hearth still exits anytime i click into settings." ADR-HEARTH-196's `.catch()`
hardening shipped and did not fix it. Tapping the gear opens `FamilyCommandCenterSettingsScreen`
(DevicesTabScreen `fcc-settings`), and the app closes.

## Investigation (this round)
- **Android emulator (HearthTest AVD, Expo Go 57, this branch's JS), no crash.** First run was with
  the Pi offline. Second run was with the Pi back online and live household data: the real activity
  log (251 entries), 20+ shared devices with a Share switch each, owner role refresh, invite panel, and
  Bump with the motion sensor active. The whole screen rendered and scrolled with no JS error. So the
  settings JS tree does not throw on this household's real data. That points at something
  iPhone-native, or at state that exists only on the phone.
- **Pi client logs (`~/.hearth-client-logs`) can't show the crash, by design.** The log buffer is
  in memory and ships once a minute (ADR-HEARTH-146), so a crash loses exactly the minute that
  matters. Only warn/error lines ship, and there was no global error handler or error boundary.
  Two iPhones log there:
  - `9cdecc60`: app 1.2.0 (has expo-sensors). Last entry 2026-10-04 01:07.
  - `b1b1a43e`: app **1.1.0** (no expo-sensors native module). Active today. Every
    `checkForUpdateAsync` fails with `ERR_UPDATES_CHECK: undefined reason`.
  `ship-update.sh` publishes to both runtimes, so both phones run the same JS when updates arrive.
- **No error boundary existed anywhere in the app.** In a release build, any component that throws
  while rendering closes the whole app. That is the exact "it just exits" symptom.
- **The one native call unique to this screen is the accelerometer** (BumpShareSection →
  `useBumpSensor`, ADR-HEARTH-130/131). Its effect depended on `onBump`, which gets a new identity on
  every App render because `App.tsx`'s `handleDeviceAdded` is a plain function. So every App re-render
  stopped and restarted the native `CMMotionManager` while its background `OperationQueue` was still
  delivering samples. Re-renders are frequent on a household with ~20 devices retrying connections.
  Unproven as the crash, but real churn on a native module, and the only iPhone-native work this screen
  does that no other screen does. Checked and ruled out: `NSMotionUsageDescription` *is* in the built
  Info.plist (expo-sensors is in prebuild's auto-applied legacy plugin list; verified with
  `expo config --type introspect`), and plain accelerometer reads need no TCC permission.

## Decisions
1. **`ScreenErrorBoundary`** (`src/ui/ScreenErrorBoundary.tsx`) wraps the settings screen in
   DevicesTabScreen. If something throws while rendering, the person sees a plain "something on this
   screen stopped working" message with Back, and the app stays open. The error and component stack
   are logged at `error`, so they ship to the Pi. Verified live on the emulator by injecting a throw
   into `PhoneNameField`: the app stayed up and `[ScreenErrorBoundary] Settings failed to render` was
   logged.
2. **Accelerometer subscribes once per visit** (`src/runtime/bumpSubscription.ts`). The latest `onBump`
   is read through a ref and a getter, and the effect depends only on `enabled`. Bump behavior is
   unchanged; only the restart churn is gone.
3. **Persisted settings-visit breadcrumb** (`src/runtime/settingsVisitBreadcrumb.ts`). The screen
   writes `opened`, `motion-sensor-starting` and `motion-sensor-running` to AsyncStorage as it goes,
   and clears the record on a normal close. On the next launch, App reports any unfinished visit at
   `error` level with the last stage reached, so it ships to the Pi. This also covers a *native* crash,
   which neither the boundary nor a JS handler can see. Verified live: killing the app while it was
   on Settings logged `lastStage: "motion-sensor-running"` on relaunch.
   - Question: why breadcrumbs instead of adding Sentry? Answer: Hearth deliberately has no crash
     reporting or analytics (ADR-HEARTH-186, the privacy screen says so). A local breadcrumb that
     ships only to the household's own Pi keeps that promise.
   - Known false positive: swiping the app away from the app switcher while on Settings also
     reports. The message says so.
4. Tests: `bumpSubscription.test.ts` (one native subscription across handler changes, start/stop
   races, rejection swallowed), `settingsVisitBreadcrumb.test.ts`, and `ScreenErrorBoundary.test.ts`
   (both lifecycle hooks, since there is no RN component renderer, per ADR-HEARTH-196).

## Consequences
- If the crash was a JS render error, it is fixed: Settings shows a fallback instead of closing, and
  the Pi log names the component.
- If it was the accelerometer restart churn, it is fixed by decision 2.
- If it is neither, the next crash leaves a `SettingsVisit` error line on the Pi with its last stage.
  `motion-sensor-starting` with no `running` points at expo-sensors. `opened` with no motion stage
  means it died before the sensor started (or on a 1.1.0 phone, which has no sensor). That is the
  evidence ADR-HEARTH-196 lacked.
- The 1.1.0 phone (`b1b1a43e`) is failing every update check. Unless that is a transient Expo outage
  (EAS's API also returned "Service Unavailable" during this session), that phone never receives this
  fix or 196's. A reinstall of the current 1.2.0 preview build fixes that permanently and is worth
  doing regardless.
