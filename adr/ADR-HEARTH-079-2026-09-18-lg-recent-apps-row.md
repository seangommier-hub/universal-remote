# ADR-HEARTH-079: Recently-launched apps row (LG webOS)

**Date:** 2026-09-18
**Status:** Accepted, implemented; not yet live-verified against real hardware

## Context

LG's real equivalent of Roku's recent-apps mechanism (ADR-HEARTH-076) was flagged there as a
"clean, real follow-up" and deliberately not built in that pass to keep it scoped. This pass builds
it: `ssap://com.webos.applicationManager/listLaunchPoints`, sourced from `hobbyquaker/lgtv2`'s own
README ("installed apps (id → title)"), the same primary reference this driver already cites for
its button list and pairing manifest.

## Research: verified the real mechanism before building

The response's wrapper key was not guessed. Confirmed directly against Home Assistant's own
production `aiowebostv` library source (`webos_client.py`): `get_apps()` (calling this exact same
`listLaunchPoints` endpoint) does `return res.get("launchPoints")`; its sibling `get_apps_all()`
(calling the different `listApps` endpoint) does `return res.get("apps")` instead — both keys are
checked in the parser below, but only `listLaunchPoints` is actually called, matching Roku's own
"corroborate, don't guess" bar from ADR-HEARTH-076.

Per-app field-name flexibility (`id`/`appId`, `name`/`appName`/`title`) is sourced from LG's own
official "Connect SDK" (2014, LG Electronics) `AppInfo.java` model, adopted verbatim by the openHAB
LG webOS binding — the same dual-field-name handling `refreshInputList` already applies for a
different endpoint on this driver.

## What was built

- `LgWebOsDriver.ts`: `refreshApps()` (best-effort, same treatment as every other inferred field on
  this driver — a failed read leaves `state.values.apps` unset rather than failing `connect()`),
  wired into `doConnect()` right after `refreshInputList`. `launchApp` now accepts a direct `appId`
  arg (any id from `state.values.apps`) alongside the original four-service `service` enum — exactly
  one is required, matching Roku's identical extension.
- `launchApp` reports `lastLaunchedAppId` — the real, resolved app id — regardless of whether the
  caller used `service` or `appId`, the same brand-agnostic field Roku's driver already populates.
  No UI changes were needed: `UniversalTvRemote.tsx`'s "Recently Launched" card (ADR-HEARTH-076)
  already resolves recent ids against the live `state.values.apps` catalog generically, with no
  brand-specific knowledge of how a given driver maps `service` to a real app id.

## Verification

Added/updated tests in `LgWebOsDriver.test.ts`: `state.values.apps` population from a real
`listLaunchPoints` response, connect() still finishing when that call fails outright, `launchApp`
by direct `appId`, `lastLaunchedAppId` reported correctly for both the `service` and `appId` launch
paths, and a rejection when neither arg is given. Every existing test that manually drives this
driver's connect handshake (rather than going through the shared `connectDriver()` helper) needed a
4th `listLaunchPoints`/apps mock response added — the same class of test-maintenance fix already
hit twice before (Roku's `/query/apps` addition, Roku's active-app corroboration). Full LG suite:
59/59 passing. Full project suite and `tsc --noEmit` both clean.

**Not live-verified against a real LG TV** — no device was available this session to confirm
`listLaunchPoints`'s real response shape matches the two independently-sourced references above, or
that the recent-apps row actually renders/updates correctly after a real launch.

## Consequences

- An LG household gets the same recent-apps convenience Roku households already have, through the
  same generic, brand-agnostic UI mechanism — no LG-specific UI code was needed.
- Samsung/Sony still don't declare `launchApp` at all (an existing, unrelated, already-documented
  gap — see `Capability.ts`'s own `launchApp` citation) — this ADR doesn't change that.
