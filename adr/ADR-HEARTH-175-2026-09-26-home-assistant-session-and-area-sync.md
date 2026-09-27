# ADR-HEARTH-175: Home Assistant shared client, WebSocket session and area sync

**Date:** 2026-09-26
**Status:** Accepted. Implements Track A steps 1-3 of ADR-HEARTH-174; extends ADR-HEARTH-166 (REST driver) and uses ADR-HEARTH-173 (rooms).
**Verification:** Unit tests against a scripted fake Home Assistant WebSocket (`src/testUtils/fakeHaServer.ts`) and a mocked `fetch`; the sync screen was checked in the web harness with a demo fixture. No real Home Assistant instance was available (see "Unverified").

## Decisions

### 1. Shared per-instance client (step 1)
- One **instance** per server, keyed by the normalized base URL (`normalizeHomeAssistantUrl`), id `ha-<scheme>-<host>-<port>` (`haInstance.ts`). It holds ONE token and, at run time, ONE WebSocket session.
- Devices now carry `config = { instanceId, entityId }` and no secret. The token lives in SecureStore under `hearth.ha.instance.<id>.token`; the address list lives in AsyncStorage `hearth.haInstances.v1` (`haInstanceStore.ts`); `haInstanceRegistry.ts` is the in-memory table the driver reads. `hydrateHaInstances()` runs at startup before any device connects.
- **Migration** (`src/runtime/haDeviceMigration.ts`, called from App.tsx after `loadDevices`): for each HA device with its own `config.token`, in this order: save the instance (token to SecureStore), save the device without the token, delete the per-device secret. Sequential, idempotent, safe to interrupt (a device that still carries a token is simply migrated again). A failure leaves that device on the old shape.
- **Old shape tolerated:** `resolveHaTarget` accepts `{baseUrl, token, entityId}` by registering the instance in memory, so a device that could not migrate (or an old shared copy) keeps working.
- `saveDevice` is now serialized through a promise queue: it is a whole-list read-modify-write, and a bulk import adds dozens of devices at once, which would otherwise drop devices.

### 2. WebSocket session (step 2)
Message shapes were taken from https://developers.home-assistant.io/docs/api/websocket (fetched 2026-09-26).
- `haSocket.ts`: transport and handshake only: `auth_required` -> `{type:"auth", access_token}` -> `auth_ok | auth_invalid`; 10 s auth timeout; `ws://`/`wss://` + `/api/websocket`. The token appears only in the auth message and is never logged.
- `haSession.ts`: id-routed requests (`result` success/error), one `subscribe_events` with `event_type: "state_changed"`, then `get_states` as the snapshot after **every** (re)connect. Events that arrive before the snapshot are buffered and replayed on top of it. Entity state fans out to watchers keyed by entity id. `ping` every 30 s with a 10 s pong timeout; a missing pong closes the socket and reconnects. Reconnect delay 2 s doubling to 30 s through `withBackoffJitter`, reset once live. `auth_invalid` sets `auth-failed` and stops retrying (`replaceToken` re-arms it).
- `subscribe_entities` was **not** used: its compressed message format is not documented on the fetched page, and `state_changed` is fully documented. Revisit for volume.
- `haInstanceHub.ts`: one session per instance, reference-counted by the devices following it (the socket and all timers close when the last device unsubscribes). `AppState` non-active closes every socket; active reopens the ones in use.
- Driver: while the session is `live` there are no per-device polling timers; while it is anything else (connecting, down, idle, background, unsupported platform) the existing 10 s REST polling runs for subscribed devices. Commands still go over REST (`POST /api/services`), unchanged. On `auth-failed` the device goes disconnected with `values.authError = "Home Assistant rejected the access token..."` and stops polling.
- The socket is direct (`ws://`/`wss://` to the HA address), not through the Family Command Center relay; remote access via the relay is Track A step 6.

### 3. Registries and bulk sync (step 3)
- `haRegistries.ts` fetches `config/area_registry/list`, `config/device_registry/list`, `config/entity_registry/list`. `haImportCandidates.ts` (pure): effective area = `entity.area_id ?? device.area_id`; skipped: `disabled_by`, `hidden_by`, `entity_category` of `config` or `diagnostic`, and entities on a disabled device; only the four supported domains (no new capability ids). An entity missing from the registry, or pointing at a deleted area, is offered with no area.
- `HomeAssistantSyncScreen`: entities grouped by area (names sorted, "No area" last), checkbox per row, default = all supported and not already added; already-added rows are shown but disabled; one Import button. `prepareHaImport` saves the credential once, builds the devices, and writes every device's room (the area name) to the ADR-173 layout store in one read and one write; the tab then adds all devices and returns to the list. A later sync lists already-added entities as disabled, so only new ones are imported, and only new devices get a room (existing room choices are never overwritten).
- If the registries cannot be read (WebSocket blocked, timeout) the flow still works: REST `/api/states` gives the list with no areas, and the screen says so.
- Single-entity add is unchanged in behaviour (now also sets its room from the area, when known).

## Questions and answers (ADR-GLOBAL-002)
- *Use `subscribe_entities`?* No; not verifiable from the docs fetched, and `state_changed` is. *Room for a re-synced entity that already exists?* Left alone (the person may have moved it). *Delete the per-device token after migrating?* Yes, last, after the instance and device are safely written. *Sockets while backgrounded?* Closed; polling is not started in the background either (drivers only poll while subscribed and the app timers are suspended by the OS).

## Unverified
- **No real Home Assistant was contacted.** The three registry `list` reply field names (`area_id`, `name`; device `id`, `area_id`, `disabled_by`; entity `entity_id`, `device_id`, `area_id`, `disabled_by`, `hidden_by`, `entity_category`) are NOT on the fetched docs page (it documents only `list_for_display`); they come from knowledge of the frontend and must be confirmed against a live server. The parsers ignore rows they cannot read, so a mismatch degrades to "no areas / nothing filtered" rather than a crash.
- iOS/Android WebSocket behaviour, `AppState` transitions and `ws://` cleartext to a LAN HA on a device were not tested.
- A shared Hearth device copied to another phone carries only `{instanceId, entityId}`; that phone has no credential and shows "sync from Home Assistant again". Household sharing of HA credentials is not designed here.
- The Import button is at the bottom of a long scrolling list; a sticky footer would help for large homes.

## Consequences
- New files under `src/drivers/homeAssistant/` (instance, registry, store, config, socket, session, hub, registries, candidates, import data), `src/runtime/` (migration, bulk import, rooms), `src/ui/HomeAssistantSyncScreen.tsx`, a demo fixture (`?demo=1&screen=ha-sync`) and two web-harness scenarios.
- `buildHomeAssistantDevice` now takes an instance instead of a URL and token.
- Next: Track A step 4 (new domains) needs new capability ids and its own ADR first.
