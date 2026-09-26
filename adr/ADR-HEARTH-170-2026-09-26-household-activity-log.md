# ADR-HEARTH-170: Household activity log

**Date:** 2026-09-26
**Status:** Accepted (built). Implements ADR-HEARTH-162 item 2 (the log half; read-back-after-command is separate).
Pi side: Family Command Center `adr/0199`.

## Context

Nobody can tell who turned something off or whether it worked. ADR-162 asked for "Sean turned off the living room TV".

## Decisions

1. **Hook at the command engine, not per driver.** `CommandEngine.setOutcomeObserver(fn)`; `execute(command, { silent })`
   notifies after every finished command whose device is known. An observer that throws is logged and ignored, so the
   log can never change a command's result. Activity-runner steps and wake tests pass `silent: true` (they are the app's
   own commands, and an Activity run already has its own run history, ADR-150). Demo mode never attaches the observer.
2. **Entry** `{ id, deviceId, deviceName, verb, ok, error?, at, who }` (`src/core/activityLog/`). `verb` is a fixed
   plain phrase that completes "<who> <verb> <device>": "turned off", "turned the volume up on", "launched Netflix on".
   `Record<CapabilityId, string>` makes a new capability a compile error until it gets wording. Unknown → "sent a command to".
3. **Privacy:** only fixed phrases plus a service name from a fixed list are ever produced. textEntry is "typed text on";
   volume/channel/input values, app ids, PINs, addresses and tokens are never included. `error` is one of four fixed
   phrases mapped from the error code; the raw driver message is dropped.
4. **Noise control (decision, flag to Sean):** successful directionalNavigation/select/back/home/menu/settings/
   selectPlayPause are not logged (dozens per minute); the same press failing is. The same person repeating the same
   action on the same device within 5 s is one line (volume held down). Everything else is logged.
5. **Who:** the same per-phone name the Activities editor already stores (`hearth.household.memberName`), now editable
   in FCC settings as "This phone is called…" (`PhoneNameField`, saved on blur) and cached synchronously
   (`runtime/phoneName.ts`) so recording never waits on storage. **Default is "Someone's iPhone" / "Someone's phone", not
   the real device name:** iOS 16+ returns a generic name to apps without a special entitlement, and reading it needs a
   native module (expo-device) that cannot ship over the shared OTA channel. Question for Sean: is a typed name, with
   this generic default, acceptable? (If not, a native build is required.)
6. **Delivery:** `ActivityLogRecorder` is a bounded outbox (500 entries, oldest dropped) persisted to AsyncStorage so a
   restart keeps undelivered entries. `activityLogShipper` posts up to 100 entries in one request about 3 s after a new
   entry and retries every 60 s in the foreground, like the client-log shipper (ADR-146). Never awaited by a command.
   Entries leave the outbox only when the Pi answers OK, or refuses them for good (400/413/422, so one bad batch cannot
   block the queue). "unconfigured" or any unreachable/5xx/404 keeps them for later. The Pi de-duplicates by `id`.
7. **Read side:** `RecentActivityList` on the FCC settings screen (shown when connected) reads GET `?limit=50` and shows
   "Sean turned off Den TV · 9:40 pm" (failures "Didn't work: …", muted). It has a Refresh button and a quiet
   "unavailable" note (covers a Pi not yet updated).
8. Files: `core/activityLog/{commandVerb,activityLogEntry,activityLogFormat,ActivityLogRecorder}.ts`,
   `runtime/{activityLogShipper,activityLogOutbox,phoneName,startActivityLog}.ts`,
   `discovery/familyCommandCenterActivityLog.ts`, `ui/{PhoneNameField,RecentActivityList,useRecentActivity}.tsx`.

## Consequences

- OTA-only; no native change. Needs the Pi's adr/0199 routes deployed to show anything; until then entries queue.
- A person who never sets a name appears as "Someone's iPhone" for both phones.
- Log lines are what people did from the remote only; automations, Pi routines and activity steps are not in it.

## Verification

Jest: verb wording and no-leak cases, formatting, recorder (dedupe, caps, redaction, restore), shipper (ack, offline,
unconfigured, rejected, batch cap, in-flight), engine observer. Web harness scenario `fcc-settings-activity` renders
the name field and demo list. Not verified on a real phone or against the live Pi from the app.
