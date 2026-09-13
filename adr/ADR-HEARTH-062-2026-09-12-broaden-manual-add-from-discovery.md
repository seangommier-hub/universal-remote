# ADR-HEARTH-062: "Add manually as..." from Discover Devices — broadening how devices get added

Date: 2026-09-12

## Status

Accepted.

## Context

Sean: "broaden the way that devices can be added and ensure that when a user has multiple repeaters
within their networks everything is there and accessible."

Investigated how device discovery actually works before changing anything: Hearth doesn't scan the
network itself — `DiscoverDevicesScreen` calls Family Command Center's
`/api/integrations/hearth/devices` route, which reads Pi-hole's device table
(`listNetworkDevices()` in that project's `pihole-client.ts`), built from ARP entries and DHCP
leases visible to the Pi. That's inherently bounded to the Pi's own network segment: a repeater in
bridge/extender mode (same subnet) is invisible as a *problem* — those devices already show up fine
— but a repeater in router mode (its own separate subnet) puts every device behind it outside what
Pi-hole/the Pi can see via ARP, with no DHCP visibility either. That half of the ask is a Family
Command Center-side fix (broadening its own discovery to actively reach other subnets), tracked
separately in that project, not fixable from here.

The half that *is* fixable here: auditing every existing Add flow (all 7 brands) found that manual
add was already fully IP/cloud-based and thus already immune to *discovery* topology — Sony,
Samsung, LG, Roku, and Yamaha each take a typed IP address with no scan dependency; Hue takes a
typed bridge IP; SmartThings is cloud-linked with no local IP at all. So every brand *can* already
be added regardless of subnet, provided the user knows the IP and something (the phone directly, or
Family Command Center's relay) can route to it.

The real, concrete gap found: `DiscoverDevicesScreen` only offers a one-tap "Connect" for a device
whose brand its regex-based `BRAND_MATCHERS` auto-recognized. An unrecognized device (or one Pi-hole
saw but the vendor string didn't match) rendered "Not yet supported" with the device's own IP
literally printed on screen — and no way to *use* that IP without leaving the screen, remembering it,
and re-typing it into the matching Add screen by hand. Same dead end for a wrong auto-match (a device
whose vendor string coincidentally matched the wrong brand's pattern).

## Decision

`DiscoverDevicesScreen` now offers "Add manually as..." on every row — recognized or not. Tapping it
shows a picker (the 5 IP-based brands: Sony, Samsung, LG, Roku, Yamaha — Hue/SmartThings excluded,
see Consequences) and opens that brand's Add screen with the IP field pre-filled from what was
already shown on screen, via a new optional `initialIpAddress` prop threaded through
`App.tsx`'s `Screen` state into each of the 5 Add screens.

Found and fixed the same header-overlap bug class as ADR-HEARTH-053/057/060 while touching this
screen: `cardBody` was `flex: 1` with no `minWidth: 0`, and `deviceName`/`deviceMeta` had no
`numberOfLines` — a long discovered hostname could overlap the Connect button. Restructured the card
into a top row (icon/body/Connect) plus the new manual-add link below, rather than trying to fit a
third element into the original single row.

## Consequences

- Every device this screen can see, regardless of whether its brand was auto-recognized, now has a
  real path to being added — the "Not yet supported" label is now informational, not a dead end.
- Hue and SmartThings excluded from the manual-add picker: Hue's "device" here would be a bridge
  (paired separately, its own IP, not the physical light being discovered), and SmartThings has no
  IP-based add shape at all — including them would either need a different flow shape or be
  actively misleading.
- Does **not** solve the router-mode-repeater visibility problem — a device Family Command Center's
  discovery genuinely cannot see at all still won't appear in this list to pick "Add manually as..."
  for. It solves "the discovery list shows something but got the brand wrong or doesn't know it,"
  not "discovery never found it in the first place." The latter is Family Command Center's own,
  separate fix.
- All 259 tests pass; typecheck clean. No new automated tests added (this is a UI wiring change —
  the underlying Add-screen `initialIpAddress` prop is a plain `useState` seed, simple enough that
  live verification covers it at the same effort level as this project's other picker-shaped UI,
  e.g. ADR-HEARTH-058's scene-editing picker).
- **Update, same night**: the brand picker was originally built with `Alert.alert`. Live-tested on
  the Android emulator immediately after and found a real cross-platform bug: Android's native
  `Alert.alert` silently drops any button past the 3rd (Cancel + 5 brands = 6 total) — LG, Roku, and
  Yamaha were simply unreachable in the picker on Android, with no error or visual sign anything was
  missing. iOS renders more buttons, so this would likely have gone unnoticed there too until someone
  specifically needed one of the dropped options. Replaced with a custom `Modal` (a backdrop +
  card of plain `Pressable` rows) with no platform-imposed button cap, so all 5 brands are always
  reachable on both platforms. Verified live on the emulator: the modal opens, lists all 5 brands
  (previously only 2 were tappable), and dismisses correctly via a brand tap, the Cancel row, or
  tapping the backdrop.

## Related

ADR-HEARTH-010, ADR-HEARTH-008, [[ADR-HEARTH-053]], [[ADR-HEARTH-057]], [[ADR-HEARTH-060]]
