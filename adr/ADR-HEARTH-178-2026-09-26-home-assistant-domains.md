# ADR-HEARTH-178: Home Assistant domains beyond the first four

**Date:** 2026-09-26
**Status:** Accepted. Implements Track A steps 4-5 of ADR-HEARTH-174; extends ADR-HEARTH-166 (driver) and ADR-HEARTH-175 (shared session, sync screen).
**Verification:** Unit and contract tests with a mocked `fetch`; every new screen and the sync list checked in the web harness (`scripts/ui-verify`, screenshots read). No real Home Assistant was contacted (see "Unverified").

## Decision
Service names and states were taken from the official integration pages (fetched 2026-09-26): cover, lock, climate, fan, vacuum, scene, script, automation, button, input_boolean, binary_sensor, sensor, and `/api/config` from the developer REST docs.

### New capability ids (ADR-first, each used by the mapping and the UI)
`open`, `close`, `stop`, `setPosition`, `lock`, `unlock`, `trigger`, `setTemperature`, `setHvacMode`, `setFanSpeed`, `setFanPreset`. Vacuums reuse `vacuumStart/Stop/Dock/setSuctionPower`; input_boolean and fan on/off reuse `power`. Sensors have no capability (read-only). New `DeviceCategory` values: `cover`, `fan`, `sensor`, `action` (`lock`, `climate`, `vacuum` already existed).

### Domain mapping
| Domain | Capabilities (from) | Service |
|---|---|---|
| cover | open/close/stop/setPosition (feature bits) | `open_cover`, `close_cover`, `stop_cover`, `set_cover_position {position}` |
| lock | lock, unlock | `lock.lock`, `lock.unlock` (no `code`, ever) |
| scene, script | trigger | `turn_on` |
| automation | trigger | `automation.trigger` |
| button | trigger | `button.press` |
| input_boolean | power | `turn_on`/`turn_off`/`toggle` |
| climate | setTemperature (feature bit 1), setHvacMode (2+ `hvac_modes`) | `set_temperature {temperature}`, `set_hvac_mode {hvac_mode}` |
| fan | power; setFanSpeed (bit), setFanPreset (bit + `preset_modes`) | `set_percentage`, `set_preset_mode` |
| vacuum | START/STOP/RETURN_HOME/FAN_SPEED bits | `start`, `stop`, `return_to_base`, `set_fan_speed` |
| sensor, binary_sensor | none (info tile) | none |

- Climate range-only devices (no target-temperature bit) are not offered; a vacuum with no START bit is not offered (honest capabilities, as in ADR-166).
- Vacuum suction levels 0-3 are spread across the entity's own `fan_speed_list`. HA vacuum states are shown with the existing vacuum screen (`workingStatus` words, `battery_level`).
- Sensors: only ones with a `device_class` or unit (bare text sensors and `timestamp` are skipped); registry `entity_category` config/diagnostic already hidden by ADR-175. Sensors are offered but **unticked** in the sync screen (a home can have hundreds).
- Binary sensor labels come from the docs table (door Open/Closed, lock Unlocked/Locked, ...); unlisted classes read On/Off.
- Climate unit: `GET /api/config` `unit_system.temperature`, read once per server (`haUnitSystem.ts`), stored as `values.temperatureUnit`. `/api/states` already delivers temperatures in that unit. If unreadable, the screen shows a bare degree sign. Default + / - step when the entity has no `target_temp_step`: 0.5 C, 1 F.
- Commands still go over REST `POST /api/services` and state over the shared session/polling (ADR-175); nothing new opens a socket.

### Unavailable and unknown
`unavailable` maps to connection `disconnected`, `unknown` to `unknown`, both with `values.unavailable = true` and `values.availability`, and **no `power` value** (it used to read as power off). Such an entity keeps being polled while the session is down so it recovers. The entity screen shows "Unavailable" / "Unknown", not a Reconnect prompt.

### Dangerous actions
`commandConfirmation.ts`: lock and unlock always ask; open/close/setPosition ask for covers whose device class is `garage`, `gate` or `door` (class saved on the device at import, or the live one from state). The entity screen shows an in-screen confirm card (not `Alert`, which Android caps and the web harness cannot show). Alarm panels are not supported, so no alarm code is entered or stored; lock commands never send a `code`.

### UI
`EntityControlScreen` (with `entityControls/*`) is the generic control screen for cover, lock, climate, fan, sensor and action devices: cover Open/Stop/Close + position slider, lock Lock/Unlock, climate + / - and mode buttons, fan power + speed slider + presets, scenes/scripts/automations/buttons a Run button with a result toast, sensors a read-only tile. The slider is drawn from Views (no new dependency; screen readers step it by 10). Vacuum uses the existing `VacuumControlScreen`; input_boolean uses the existing outlet remote.

## Questions and answers (ADR-GLOBAL-002)
- *Confirm inside the driver or the UI?* UI. Activities and other automated callers of `CommandEngine` are not blocked; a person who puts "unlock" in an Activity did it deliberately, but this is a risk to revisit (kid mode / schedules).
- *Why `automation.trigger` with default `skip_condition`?* Matches HA's own "Run actions"; not overridden.
- *Sensors default ticked?* No (noise).

## Unverified
- **No real Home Assistant.** The integration pages list feature names but not their numbers, so the bit values (cover 1/2/4/8, fan 1/8, climate 1, vacuum 8/16/32/8192) are from the Home Assistant source as remembered, not from the docs. Confirm against a live server, especially the vacuum START bit.
- `climate.set_temperature`/`fan.set_percentage`/`vacuum.set_fan_speed`/`automation.trigger` parameter names come from HA knowledge; the fetched pages did not list parameters.
- The slider was exercised only via its render in the web harness, not a drag gesture, and never on a phone.
- iOS/Android rendering of the new screens is unchecked.
- Confirmation does not cover Activities/schedules (above). Existing HA devices added before this ADR have no stored `deviceClass`; the live state supplies it once connected.

## Consequences
New files: `haSensorMapping.ts`, `haUnitSystem.ts`, `core/engine/commandConfirmation.ts`, `ui/EntityControlScreen.tsx`, `ui/entityControls/*`, `demo/demoEntityDevices.ts`; demo devices appear only for `?screen=remote:ha-*`. Next: Track A step 6 (extended media_player, remote access via the FCC relay, camera, alarm panel).
