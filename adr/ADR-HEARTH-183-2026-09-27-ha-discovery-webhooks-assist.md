# ADR-HEARTH-183: Home Assistant mDNS discovery, Activity webhook bridge, and Assist

**Date:** 2026-09-27
**Status:** Accepted. Implements ADR-HEARTH-174 Track A step 7 (mDNS discovery, Assist text box) and Track B item 6 (HA webhook/event bridge). Pairs with Family Command Center adr/0205 (the Pi side of discovery and the incoming webhook route).
**Verification:** `npx tsc --noEmit` clean; `npx jest --silent` (full app suite, only the pre-existing unrelated `runner/shims/shims.test.ts` WebSocketServer failure, ignored per this task's own instructions). Live-verified on the Pi: 401 for an unconfigured/malformed webhook id, 200 + a real run for a configured one (see "Real vs unverified"). No real Home Assistant instance was available anywhere in this work, so the mDNS announcement, the Assist screen, and the outgoing webhook were checked only against the app's own unit tests and mocks.

## Context
ADR-HEARTH-166/175/178/182 built Home Assistant support up to a REST+WebSocket driver covering most
domains. Three gaps remained from ADR-HEARTH-174's roadmap: no way to *find* a Home Assistant server
on the network, no way for HA and Hearth to trigger each other, and no way to talk to HA's Assist
conversation agent from the phone.

## Decision 1: mDNS discovery, surfaced through the existing add flow
- All of the actual mDNS work is on the Pi (adr/0205): `_home-assistant._tcp` added to the browse list,
  TXT fields confirmed against Home Assistant's own zeroconf source (not the docs page fetched at
  https://www.home-assistant.io/integrations/zeroconf/, which does not list them -- that page was
  fetched first per the task and found to lack the technical detail, so the source itself was fetched
  next).
- The Pi's `/discover/all` contract gained one new, deliberately brand-neutral field:
  `serviceUrl: string | null` on both `Candidate` and `DiscoveredDevice`/`NetworkDevice`. It is not
  named or typed as Home-Assistant-specific, so a future brand that also announces its own base URL
  can reuse it without another contract change.
- App side: `NetworkDevice.serviceUrl` (`src/discovery/discoverAll.ts`) is parsed from the row and
  merged like every other field. `onOpenBrandScreen`'s signature grew a third, optional parameter
  (`serviceUrl`) threaded through `useAddDiscoveredDevice.ts` -> `DeviceListScreen.tsx`/
  `DiscoverDevicesScreen.tsx`/`SuggestedDevicesSection.tsx` -> `DevicesTabScreen.tsx`'s screen state ->
  `renderAddScreen.tsx` -> `AddHomeAssistantScreen.tsx`, which now prefills its URL field with
  `initialServiceUrl ?? initialIpAddress ?? ""` (the announced URL wins over a bare IP; a saved
  instance still wins over both, unchanged from ADR-HEARTH-166).
- Nothing else changed in the "Sync from Home Assistant" flow itself (ADR-HEARTH-175's bulk
  import/area-to-room mapping is unaffected) -- this only ever prefills the address field of the
  existing entry point.

## Decision 2: the webhook bridge lives on the Activity, both directions off by default
- New type `ActivityHomeAssistant { incomingWebhookId?: string; outgoingWebhookUrl?: string }` on
  `Activity` (`src/core/types/Activity.ts`), normalized/validated in a new sibling module
  `src/core/activities/haWebhookModel.ts` (mirrors `scheduleModel.ts`'s shape rather than growing
  `activityModel.ts` itself, per ADR-GLOBAL-003).
- **Incoming:** `incomingWebhookId` is a UUID v4 generated *in the app* (`expo-crypto`'s `randomUUID`,
  the same primitive already used for run ids) -- never the shared Family Command Center bearer token,
  and never anything server-generated, per the task's explicit requirement. The editor's "Home
  Assistant" section (`ActivityHomeAssistantSection.tsx`) shows the full callable URL
  (`<fcc base>/api/integrations/hearth/ha-webhook/<id>`) once the toggle is on, with a "Regenerate"
  button that swaps in a fresh id (invalidating the old URL). The Pi route side (adr/0205) is what
  actually runs the Activity when called; nothing on this side calls it.
- **Outgoing:** `outgoingWebhookUrl` is a plain URL field the household pastes from Home Assistant's own
  "Webhook" automation trigger. Firing it is done from the one shared `runActivity`
  (`src/runtime/activityRunner.ts`), not from any UI screen, so a run started from the phone, from a
  scheduled Pi tick, or from the incoming webhook itself all notify Home Assistant the same way. The
  POST (`src/runtime/haOutgoingWebhook.ts`) is `void`-called (fire-and-forget), never throws, has its
  own 5 s timeout, and logs only the URL's hostname on failure -- never the URL itself, since Home
  Assistant embeds its own webhook secret in the path.
- **Both fields are sent explicitly on every save once the section exists**, unlike `schedules`'
  omitted-means-keep convention: there is no legacy phone build that ever had a "half-configured"
  webhook to protect, so the Pi's own omitted-means-keep tolerance (adr/0205) is pure defense for a
  phone build that predates this feature, not something the current app relies on.

## Decision 3: Assist screen, reached from the Devices list rather than a per-entity screen
- **Ambiguity flagged, decided without asking (ADR-GLOBAL-002 exception, logged here since there was no
  synchronous channel back to Sean mid-task, matching ADR-HEARTH-177 point 6's precedent for the same
  situation):** Home Assistant entities do not have one dedicated "device list" screen of their own --
  they are interspersed across the main Devices list and several domain-specific screens
  (`EntityControlScreen`, `LightControlScreen`, the TV remote, etc., per ADR-HEARTH-178/182). Rather
  than add an "Ask Home Assistant" button to every one of those screens, the entry point is a single
  header icon on `DeviceListScreen` (the actual device list this instruction names), shown only once at
  least one Home Assistant device is present, resolving to whichever HA instance that first device
  belongs to. A household with two Home Assistant servers gets Assist wired to only one until a second
  device from the other instance is added; revisit if that turns out to matter in practice.
- `src/drivers/homeAssistant/haAssist.ts` posts to `/api/conversation/process`, shape confirmed against
  https://developers.home-assistant.io/docs/intent_conversation_api (fetched 2026-09-27, not memory):
  request `{text, conversation_id?}`, response `response.speech.plain.speech`. A 404 (no Assist support)
  raises `AssistUnsupportedError`, shown as its own message rather than a generic failure.
- `HomeAssistantAssistScreen.tsx`: a plain scrolling exchange list (question/answer bubbles) plus a text
  input, over the same per-instance credential (`getHaInstance`) every other Home Assistant request
  already uses -- no new credential plumbing.

## Questions and answers (ADR-GLOBAL-002)
- *Where does the outgoing POST actually run?* Inside the shared `runActivity`, so it is one code path
  for every trigger source instead of three.
- *Regenerate the incoming id, or let it be edited?* Regenerate-only (a fresh random value) -- letting
  someone type an arbitrary id would make it guessable by whoever chose it.
- *Assist entry point: per-entity or list-level?* List-level (see Decision 3) -- decided without asking,
  logged here.

## Real vs unverified
**Real (live-checked on the Pi, adr/0205):** the ha-webhook route answering 401 for a missing/malformed
secret id and for one no Activity has configured; 200 plus an actual run (through the real shared
`RunnerProcess` and `hearth-runner.cjs`, recorded in `/activity-runs` with `by: "Home Assistant"`) for a
test Activity with a single harmless `delay` step; the test Activity was deleted afterward. `discover/all`
still answers 200 in ~8s with the new mDNS service type added to the browse list (24 devices found on
Sean's LAN, none of them Home Assistant, as expected -- no HA instance exists there).

**Unverified (no Home Assistant instance available anywhere):**
- The mDNS TXT field names (`base_url`/`internal_url`/`external_url`/`version`/`uuid`/`location_name`)
  come from Home Assistant's own zeroconf component source, not a live announcement.
- The Assist conversation request/response shape comes from Home Assistant's developer docs, not a real
  server; `AssistUnsupportedError`'s 404 path and the fallback "didn't say anything back" text are
  exercised only by mocked-fetch tests (`haAssist.test.ts`).
- The outgoing webhook was never POSTed to a real Home Assistant webhook trigger; `haOutgoingWebhook.ts`
  is covered by mocked-fetch tests only (`haOutgoingWebhook.test.ts`).
- iOS/Android local-network permission behavior for the new Assist request was not exercised on a
  device (same caveat ADR-HEARTH-166 already carries for the rest of this driver).

## Consequences
- New files: `src/core/activities/haWebhookModel.ts`, `src/runtime/haOutgoingWebhook.ts`,
  `src/drivers/homeAssistant/haAssist.ts`, `src/ui/ActivityHomeAssistantSection.tsx`,
  `src/ui/HomeAssistantAssistScreen.tsx`, plus each one's test file.
- Changed: `Activity.ts` (new `homeAssistant` field), `activityModel.ts` (normalize/validate it),
  `activityRunner.ts` (fires the outgoing webhook), `discoverAll.ts` (`serviceUrl`), `DeviceListScreen`/
  `DevicesTabScreen`/`DiscoverDevicesScreen`/`SuggestedDevicesSection`/`useAddDiscoveredDevice`/
  `renderAddScreen`/`AddHomeAssistantScreen` (the `serviceUrl` prefill and the new Assist button).
- Follow-ups (from ADR-HEARTH-174's own "later" list, unchanged by this work): OAuth sign-in for Home
  Assistant, a hosted client_id page, remote Assist/webhook access through the Family Command Center
  relay for a household away from home.
