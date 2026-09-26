# ADR-HEARTH-166: Home Assistant driver ("Sync from Home Assistant")

**Date:** 2026-09-26
**Status:** Accepted. Implements the Tier 3 item of ADR-HEARTH-158 (a Home Assistant driver unlocks HA's integrations).
**Verification:** Unit and contract tests with a mocked `fetch` only. No Home Assistant instance was available, so no
request has been made to a real HA server (see "Unverified").

## Context
Hearth can only drive hardware it has a native driver for. Home Assistant already bridges hundreds of integrations
behind one REST API, so one driver widens the device list without per-brand work.

## Decision
- **Brand:** `homeassistant` in `BRAND_REGISTRY`, "custom-screen" add mode, `needsIp: false` (identified by URL + token,
  like SmartThings/SwitchBot, so it never appears in the by-address brand picker). Hint and the "Setup This Device" guide
  explain, in plain language, where to create a long-lived access token (profile > Security > Long-lived access tokens).
- **One Hearth device per HA entity.** `config = { baseUrl, token, entityId }`. The key `token` is already in
  `SENSITIVE_CONFIG_KEYS` (persistence.ts), so the token is stored in SecureStore like every other secret. No new secret
  plumbing. The token is sent only as an `Authorization: Bearer` header, never in a URL, and never logged (test asserts it).
- **Import:** `GET /api/states`, keep `switch`, `light`, `media_player`, `remote`. Entities whose honest capability list is
  empty (for example a media player with no `supported_features`) are not offered. The add screen adds one entity per
  visit, matching SmartThings, because `onAdded` navigates to the post-add screen. Bulk import is a follow-up.
- **Honest capabilities per entity** (`haEntityMapping.ts`):
  - `switch`: power. `light`: power; setBrightness if any `supported_color_modes` other than `onoff`; setColor if
    any of hs/xy/rgb/rgbw/rgbww.
  - `media_player` from `supported_features` bits: TURN_ON+TURN_OFF -> power (only one -> powerOn/powerOff),
    VOLUME_SET -> setVolume, VOLUME_STEP -> volumeUp/Down, VOLUME_MUTE -> mute, PAUSE -> playPause,
    SELECT_SOURCE -> inputSelection. HA media players expose no navigation, so none is declared.
  - `remote`: power plus directionalNavigation/select/back/home/menu, sent as `remote.send_command` (see Unverified).
  - `cover`: **not imported.** Capability.ts has no open/close/position capability, and mapping open/close onto
    power/powerOn/powerOff would lie about what the button does. Needs a new capability (its own ADR) first.
- **Commands:** `POST /api/services/<domain>/<service>`. `power` uses the domain's `toggle` service (no read-then-write
  race); after every command the entity is re-read so state reflects what HA actually did. Bad arguments raise
  `HaCommandValidationError` and never mark the device disconnected (same rule as Roku).
- **State:** `GET /api/states/<entity_id>` polled every 10 s (`HOME_ASSISTANT_POLL_INTERVAL_MS`), only while at least one
  listener is subscribed and the device is connected, so an idle device makes zero requests and leaves no timers.
  An `unavailable`/`unknown` entity reads as power off with `values.unavailable = true` and stays "connected" (HA is
  reachable; the entity is not).
- **Reconnect:** a failed connect, poll or command marks the device disconnected and retries with 2 s doubling to 30 s,
  each delay through `withBackoffJitter`. Connects are de-duplicated; `disconnect()` invalidates in-flight attempts.
  All requests use `fetchWithTimeout`.
- **Structure (ADR-GLOBAL-003):** `HomeAssistantClient` (REST), `haEntityMapping`, `haStateMapping`, `haCommandMapping`,
  `haDeviceFactory`, `HomeAssistantDriver`, `AddHomeAssistantScreen`, each single-purpose and under 500 lines.

## Questions and answers (ADR-GLOBAL-002)
- *WebSocket `subscribe_events` or polling?* Polling. It is the "simple" path allowed by the request, needs no auth
  handshake state machine, and fits the existing per-request `fetchWithTimeout` and contract-suite model. Revisit if
  10 s latency proves too slow.
- *mDNS `_home-assistant._tcp` auto-suggest?* Not built. The discovery pipeline has only SSDP and Family Command
  Center providers; there is no mDNS provider in the app to extend. The URL field is instead pre-hinted with
  `homeassistant.local:8123` (placeholder), which is HA's default mDNS name. A future mDNS provider (or an FCC scan)
  could feed this screen.
- *Cover?* Skipped, see above.

## Unverified
- No real Home Assistant was contacted. Request shapes follow HA's documented REST API (`/api/states`,
  `/api/states/<id>`, `/api/services/<domain>/<service>`, bearer auth) and its media_player/light feature constants,
  but are checked only against mocks.
- `remote.send_command` key names (`up`, `down`, `left`, `right`, `select`, `back`, `home`, `menu`) are the common
  lower-case ones; each HA integration defines its own vocabulary (Harmony, Android TV and Roku differ), so navigation
  may do nothing on some remotes. HA returns success for unknown commands on several integrations, so this cannot be
  detected from the response.
- `http://` to a LAN HA works on iOS only if the app allows local-network cleartext traffic; not tested on a device.

## Consequences
- Adds a driver, brand and add screen; no changes to shared UI or storage.
- Follow-ups: bulk import, mDNS provider, a cover capability, per-remote command-name mapping, WebSocket push.
