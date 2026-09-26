# ADR-HEARTH-148: Any device on the network is addable in one tap

Date: 2026-09-26
Status: Accepted

## Context

Sean: "it should be very easy, any device on the network should be available for adding."
A read-only audit of the add flow found:

1. Discover showed only devices with an IP; unrecognized ones were "Not yet supported" with no
   Connect button. The home "Suggested" list hid anything not labeled tv / smart_speaker / smart_device.
2. Only 8 brands were ever recognized (BRAND_MATCHERS, SEARCH_TARGETS). Chromecast, Apple TV, PS5,
   Xbox, Hue, Broadlink, SwitchBot and the feeder had drivers but were never matched.
3. 16 Add*Screen files and five duplicated brand lists (BRAND_MATCHERS, SEARCH_TARGETS,
   ADD_DEVICE_OPTIONS, two MANUAL_ADD_BRANDS, the DevicesTabScreen switch).
4. Connect-from-discovered-row logic was duplicated in Discover and DeviceList.
5. Sony one-tap Connect always failed (the driver needs a PSK) and showed a raw error.
6. Hue's HuePairingPendingError silently reset the form.
7. Errors were raw driver strings.
8. LG / Chromecast / Broadlink / Apple TV need Family Command Center but only said so in hint text.

## Decisions

- **One brand registry** (`src/discovery/brandRegistry.ts`): id, label, driverId, category, icon,
  add mode (`ip-only` / `inline-fields` / `custom-screen`), FCC requirement, required fields with
  "where do I find this" help, vendor pattern. FCC discovery matching, SSDP search targets, the home
  add picker, the brand picker and the generic add screen all read it. Existing driver ids and
  device shapes are unchanged, so persisted devices keep working.
- **Discovery client** (`discoverAll.ts`): calls `GET /api/integrations/hearth/discover/all` (the
  contract agreed with the Pi work), LAN address first then public. A 404 or any failure falls back
  to the existing SSDP + inventory scan; an unreachable Pi is classified with
  `classifyNetworkFailure` and shown as such, never as "No devices found". Merge is by IP, the more
  confident sighting wins and fills blanks from the other.
- **Row model** (`discoveryRows.ts`): identified first, then "Other devices"; every row has exactly one
  primary button - Add (recognized), Identify (unknown), Added (already in Hearth, matched by MAC or
  IP). Nothing is hidden. Identify re-runs identification; if still unknown it opens a brand picker
  sorted by vendor guess, then continues as that brand with the IP prefilled.
- **One connect helper** (`addDeviceFlow.ts`): used by Discover, the home Suggested list and the
  generic add screen. It returns `added | needs-fields | needs-fcc | custom-screen | failed`; a
  failed connect disconnects the driver (ADR-HEARTH-052) and returns classified, friendly text.
- **Sony PSK / Xbox Live ID** are inline steps on the row (label, TV-menu path help), not failures.
- **Requires FCC** rows say "Requires Family Command Center - set it up first" with a button to FCC
  setup instead of attempting a connect that cannot work.
- **Hue** pairing polls (`huePairing.ts`, 2 s interval, 60 s ceiling, cancellable) and shows "Press
  the link button on the bridge" instead of resetting the form.
- **One generic add screen** (`GenericIpAddDeviceScreen`) replaces ten Add screens (Roku, Yamaha,
  Denon, Sonos, Kasa, Chromecast, Broadlink, LG, Samsung, Squirrel Feeder). Sony, Xbox, Hue, PS5,
  Apple TV, SwitchBot and SmartThings keep their own screens, routed from `renderAddScreen`.
- The home Suggested list now shows every not-yet-added device with the same single button
  (supersedes the HOUSEHOLD_PLAUSIBLE_CATEGORIES filter of ADR-HEARTH-094).
- Xbox is now recognized by hostname; its row asks for the Live ID inline (supersedes the exclusion
  in ADR-HEARTH-064).

## Decision log (ADR-GLOBAL-002)

Decided under a fixed brief from Sean with no live user to ask, so choices were made and recorded:
- Q: run SSDP alongside the endpoint? A: no, endpoint first with fallback only on failure (SSDP's
  native path is broken on iOS, ADR-HEARTH-095); revisit if the endpoint misses devices.
- Q: keep the feeder's own screen? A: no, the Feeder tab uses the generic screen (no Cancel button).
- Q: which brands need FCC? A: LG, Chromecast, Broadlink, Apple TV, PS5.

## Remaining

- The Pi `/discover/all` endpoint is not in this branch; nothing has run against it yet.
- No real-device test of Add, Identify, the Sony PSK step, the Hue polling or the FCC-required row.
- FCC brand list is from the existing hint text and drivers; confirm against the Pi.
- `DeviceListScreen.tsx` is still over 500 lines (was 762); split the long-press actions modal next.
- The fallback path cannot see hosts that SSDP and the inventory both miss; only the endpoint can.
