# ADR-HEARTH-076: Recently-launched apps row (Roku)

**Date:** 2026-09-16
**Status:** Accepted, implemented; not yet live-verified against real hardware

## Context

Last item from the same-day three-agent research pass (ADR-HEARTH-073). Roku's own official app
"quickly launch your most recent channels" (roku.com's own app description), and a real community
writeup found its removal in one release made channel-finding "a crapshoot with hours of
searching." Deferred at the time this research first landed because it needed a real prerequisite:
Hearth's `launchApp` only supported four fixed streaming services (`netflix`/`hulu`/`primeVideo`/
`youtube`), not any arbitrary installed channel.

## Research: verified the real mechanism before building

Confirmed byte-for-byte against `python-rokuecp`'s own `Application` model
(`ctalkington/python-rokuecp`, `src/rokuecp/models.py`, fetched and read directly) that
`GET /query/apps` returns `<apps><app id="..." version="...">Name</app>...</apps>` — the exact
same per-app shape `/query/active-app` already used (ADR-HEARTH-068), just repeated once per
installed channel. Roku's own ECP docs page didn't yield this specific endpoint's section via
automated fetch this session (CDN blocked it) — flagged honestly as resting on the community
client rather than a directly-read primary source, not presented as more certain than it is.

LG has a real equivalent (`ssap://com.webos.applicationManager/listLaunchPoints`, sourced from
`hobbyquaker/lgtv2`'s own README) — **not wired up this pass**, scoped down to Roku only to keep
this addition well-bounded; flagged as a clean, real follow-up rather than silently expanded to.

## What was built

- `RokuEcpClient.ts`: `getApps()` (parses every `<app>` element, not just the first — a new
  `extractAllXmlElements` helper, since the existing single-match extractors only ever found one).
- `RokuEcpDriver.ts`: `refreshApps()` (best-effort, same treatment as every other inferred field —
  a failed read leaves `state.values.apps` unset rather than failing `connect()`) populates the
  real installed-channel catalog. `launchApp` now accepts an `appId` arg (any id from that
  catalog) alongside the original `service` enum — exactly one is required.
- **The chicken-and-egg problem, solved**: a recent-apps row is useless if nothing can ever
  populate it without a "browse all apps" screen this pass didn't build. Fixed by having
  `launchApp` report `lastLaunchedAppId` — the real, resolved channel id — regardless of whether
  the caller used `service` or `appId`. This lets the UI record history from the *existing* four
  fixed streaming tiles too, not only from a hypothetical future browse screen, while staying
  brand-agnostic (the UI never needs to know Roku's own service-to-channel-id mapping).
- `recentAppsPersistence.ts` (new, mirrors `scenePersistence.ts`'s shape): per-device list of
  recently-launched app ids, most-recent-first, capped at 6, deduped on re-launch.
- `UniversalTvRemote.tsx`: a new "Recently Launched" card, shown only when there's something real
  to show — recent ids are resolved against the *live* `state.values.apps` catalog every render
  (an id for something since uninstalled just silently drops out, rather than showing a stale or
  wrong name). Both this row's tiles and the existing four fixed streaming tiles now go through a
  new `sendLaunchApp()` wrapper (awaits the result, unlike the fire-and-forget `send()`) so either
  path correctly updates the history.

## Verification

23 new tests across `RokuEcpClient.test.ts` (getApps parsing, single-vs-multi-app XML shapes, a
dropped id-less entry), `RokuEcpDriver.test.ts` (state.values.apps population, launchApp by appId,
lastLaunchedAppId for both launch paths), and `recentAppsPersistence.test.ts` (persistence,
recency reordering, dedup, the 6-entry cap, per-device isolation, corrupted-data fallback). Full
suite: 34 suites / 350 tests, `tsc --noEmit` clean.

**Not live-verified against a real Roku** — no device was available this session to confirm
`/query/apps`'s real response shape matches the community-client-sourced assumption, or that the
row actually renders/updates correctly after a real launch.

## Consequences

- A Roku household gets faster access to whatever they actually watch most, without needing this
  pass's un-built "browse all installed channels" screen — history builds itself from ordinary use
  of the existing four streaming tiles.
- LG's real, sourced equivalent (`listLaunchPoints`) remains a clean, scoped follow-up — not
  silently expanded to, not forgotten either.
- Samsung/Sony still don't declare `launchApp` at all (an existing, unrelated, already-documented
  gap — see `Capability.ts`'s own `launchApp` citation) — this ADR doesn't change that.
