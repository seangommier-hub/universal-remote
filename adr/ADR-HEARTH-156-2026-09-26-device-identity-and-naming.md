# ADR-HEARTH-156: Device identity and naming from the device itself

**Date:** 2026-09-26
**Status:** Accepted, implemented; depends on the Pi identify endpoint (built in parallel) for the richest results

## Context

Sean: "think about when identifying a device how the Hearth app can identify what the device is, think
about how it can get its name." The best name almost always comes from the device (the person already
named it in its own settings), and identity has to survive IP changes. Before this, names were the
brand default or a driver-reported name (ADR-HEARTH-085/088), and duplicate detection compared only
`hwaddr`.

## Decision

- **Name precedence** (`src/discovery/deviceIdentity.ts`, pure, `resolveDisplayName`):
  1. a name the user typed in Hearth, 2. the name the device reports about itself, 3. UPnP / mDNS
  friendly name, 4. router / DHCP hostname, cleaned, 5. "Vendor Model", 6. brand label, 7. "Unknown device".
  Cleaning: strip domain suffix (`.lan`, `.local`, ...), turn `_`/`-` into spaces, drop trailing MAC-suffix
  or `XX` noise, drop generic bracket tags (`[TV] Samsung 7 Series (55)` -> `Samsung 7 Series (55)`,
  `[LG] webOS TV OLED55C1` -> `LG webOS TV OLED55C1`), alias table (`LGwebOSTV` -> `LG TV`,
  `ESP_1A2B3C` -> `ESP device`); bare IPs and pure-hex hostnames yield nothing so the next tier is used.
- **`identifyDeviceByIp(ip)`** (`src/discovery/identifyDevice.ts`) calls
  `GET /api/integrations/hearth/discover/identify?ip=` through `fccRequest` and returns
  `{brand, model, name, uuid, mac, serial, evidence}` or `null` on 404 / failure / no Pi (never throws).
- **One add path.** `connectBrandDevice` (addDeviceFlow.ts) starts identify in parallel with the driver
  connect (optional dep, so nothing regresses), then feeds the typed name, the driver's
  `state.values.deviceName`, the identify answer and discovery hints (friendly name, hostname, vendor,
  model) into `resolveDisplayName`. It also stores `uuid`, `serial`, `model` and a missing MAC (`hwaddr`)
  on the Device (`config` additions are ignored by drivers). The Add-by-IP screen no longer prefills the
  brand default as if the user had typed it; `useIdentifiedName(ip, brand)` shows the device's own name as
  the placeholder once a full IPv4 is typed.
- **Stable identity.** `deviceIdentityMatch.ts`: two devices are the same when they share hwaddr, uuid or
  serial (case-insensitive). Used by `selectDevicesToImport` and `App.tsx handleDeviceAdded`, so a device
  seen twice or re-discovered after an IP change merges (keeping the existing id, name, room, sharing).
  `findCurrentIpByIdentity` (MAC, then UUID, then saved name) replaces the MAC-or-name choice in the LG and
  Samsung self-healing; it needs the Pi inventory to expose `uuid` (ignored when absent).
- **Rename sync.** `hearth.deviceNameSource` (AsyncStorage map, deviceId -> source; not on the Device)
  records whether the saved name was typed ("user") or derived. If the device's reported name later differs
  and the source is not "user" (and is recorded), the device long-press menu offers
  `Use the name set on the device: "..."`. Renaming through Hearth records "user"; applying the suggestion
  records "device". Devices with no recorded source (saved before this ADR) get no suggestion. Never
  automatic.

## Self-reported name sources per brand

| Brand | Source |
|---|---|
| Roku | `http://ip:8060/query/device-info` (`user-device-name`, `friendly-device-name`, `model-name`, `serial-number`) |
| Samsung | `http://ip:8001/api/v2/` (`device.name`, `device.modelName`, `device.wifiMac`, `id` as uuid) |
| LG webOS | SSDP/UPnP description `friendlyName` and `UDN`; after pairing, system info (model, `settings` device name) |
| Sony Bravia | `system` service `getSystemInformation` (`model`, `serial`, `macAddr`, `name`) |
| Chromecast | `http://ip:8008/setup/eureka_info` (`name`, `hotspot_bssid`, `ssdp_udn`) |
| Sonos | `http://ip:1400/xml/device_description.xml` (`roomName`, `modelName`, `UDN`) |
| Kasa | `get_sysinfo` `alias`, `model`, `deviceId`, `mac` |
| Yamaha MusicCast | `/YamahaExtendedControl/v1/system/getDeviceInfo` and `getNetworkStatus` (`network_name`) |
| Denon / Marantz | `/goform/Deviceinfo.xml` and the AVR description `friendlyName` |
| Philips Hue | bridge `/api/config` (`name`, `bridgeid`, `mac`) |
| Apple TV | mDNS `_airplay._tcp` / `_companion-link._tcp` instance name and TXT `model` |

The Pi identify endpoint is expected to gather these; the phone-side drivers already expose
`state.values.deviceName` for Roku and Kasa (ADR-HEARTH-085/088) and that value enters the same resolver.

## Integration points left for follow-up

- Pi `/discover/identify` must return `uuid`; Pi `/devices` inventory should expose `uuid` for UUID-based
  re-location.
- Brand-specific screens (Sony, Xbox, PS5, Hue, Apple TV, SmartThings) still use their own name fields;
  they can adopt `useIdentifiedName` / `connectBrandDevice` hints in a later pass.
- Other drivers' self-healing (Roku, Kasa, Sonos, ...) can switch to `findCurrentIpByIdentity`.
