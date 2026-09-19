# ADR-HEARTH-095: SSDP discovery — native device finding with zero Pi dependency

**Date:** 2026-09-19
**Status:** Accepted, implemented (JS/discovery logic); iOS-side entitlement deferred after a real build failure — see Addendum

## Context

Sean, directly: "as much as i want the pi to be interconnected, it shouldn't be the thing that is
needed to be able to connect devices on the network, the pi5 and command center are a symbiotic
supplement to Hearth." Correct and real: discovery (finding a device without typing its IP) was
100% dependent on Family Command Center — there was no other mechanism at all. ADR-HEARTH-089 made
FCC optional for *adding* a device (manual IP entry always worked standalone), but never for
*discovering* one.

A research agent investigated what native discovery is actually achievable in this project's real
constraints (Expo managed workflow, iOS-first, no existing Thread/Matter hardware — building on the
same rigor as the earlier Matter feasibility research) before any implementation:

- **SSDP** covers 5 of Hearth's 6 auto-recognized brands directly — verified per-brand against
  real sources: Roku (`roku:ecp`, official ECP docs), LG webOS (`urn:lge-com:service:webos-second-
  screen:1`, openHAB's lgwebos binding), Samsung Tizen (`urn:samsung.com:device:
  RemoteControlReceiver:1`), Sony BRAVIA (`urn:schemas-sony-com:service:IRCC:1`, Home Assistant's
  SSDP integration), Yamaha MusicCast (no brand-specific ST exists — the generic UPnP
  `MediaRenderer:1`, filtered by a "Yamaha" string in the response, confirmed via the Elixir
  `musiccast` library — lower-confidence than the other four, flagged honestly as such in code).
  Kasa is NOT SSDP — its legacy protocol uses its own UDP scheme — stays FCC/manual-only.
- **mDNS** (`react-native-zeroconf`, actively maintained) is the *safer* native option but doesn't
  cover any of these brands at all — TVs use SSDP for control discovery, not Bonjour. It would only
  help future device categories (Chromecast, AirPlay) Hearth has no driver for yet.
- Presented this exact tradeoff to Sean directly (safe-but-doesn't-solve-today vs.
  solves-today-but-fragile) rather than picking silently — he chose SSDP.

## Verifying the risk myself before committing to it

Independently confirmed (not just trusting the research agent) that `react-native-udp` — the only
real RN UDP-socket library — has had **zero commits since January 26, 2023** on its actual GitHub
repo (checked directly), despite one of its listed maintainers (Rapsssito) being very actively
maintaining a sibling `react-native-tcp-socket` package as recently as days before this session.
Their attention has clearly moved elsewhere. No better-maintained fork exists (checked several: all
either abandoned, HarmonyOS-specific, or trivial personal forks with no real additional activity).
This is a real, accepted risk, not a hidden one.

## Decision

- **`src/discovery/SsdpDiscoveryProvider.ts`**: sends targeted M-SEARCH UDP multicast requests
  (one per verified brand ST) to `239.255.255.250:1900` via `react-native-udp`, listens for the
  unicast HTTP-over-UDP responses that follow (no multicast group membership needed for this —
  only for *receiving* multicast traffic, which M-SEARCH replies aren't), and reports matches
  through the same `DiscoveryProvider` interface FCC's own provider already implements.
- **`src/discovery/scanAllProviders.ts`**: runs SSDP and Family Command Center concurrently via
  `Promise.allSettled`, merging by IP address — one provider failing (FCC unconfigured, SSDP's iOS
  entitlement not granted) never affects the other's results, and a device both find keeps
  whichever entry has a real `hwaddr` (FCC's), since that's what downstream duplicate-prevention
  (ADR-HEARTH-085) matches on.
- Wired into both `DeviceListScreen`'s inline "Suggested" section and the full
  `DiscoverDevicesScreen` — the latter's old hard "Family Command Center isn't connected" error
  state is gone entirely (nothing throws anymore); an empty result now shows a soft, non-blocking
  suggestion to connect FCC for broader coverage, not a wall.
- **Native config**: Android gets `CHANGE_WIFI_MULTICAST_STATE` (without it, WiFi chips silently
  filter multicast frames as a battery-saving default even with a working socket) — this permission
  needs no approval and ships immediately. iOS's `com.apple.developer.networking.multicast`
  entitlement is intentionally NOT in `app.config.js` yet — see Addendum below for why.

## Addendum (same day): the iOS entitlement can't just be declared "ahead of approval"

Originally declared the multicast entitlement in `app.config.js` on the assumption that it would
sit harmlessly unused until Apple approved it — the same pattern as declaring
`NSLocalNetworkUsageDescription` before a user grants the runtime permission. **That assumption was
wrong, and a real build failure corrected it immediately**, not a hypothetical caught in review:

```
error: Provisioning profile "..." doesn't include the Multicast Networking capability.
Multicast Networking capability needs to be assigned to your team and bundle identifier by
Apple in order to be included in a profile.
error: Entitlement com.apple.developer.networking.multicast requires approval from Apple to
include in a profile. Please request access to the associated capability. To continue building
for device during request processing, remove entitlement and add upon approval.
```

Unlike a runtime permission (which just fails at runtime if unapproved), Xcode's own provisioning-
profile generation refuses to build *at all* with an unapproved entitlement declared — this would
have blocked every future build (SSDP-related or not) until Apple approved the request, with no way
to ship anything else in the meantime. Removed the entitlement from `app.config.js` entirely.
**Sean must request it himself** at `developer.apple.com/contact/request/networking-multicast` —
not something any tool or script here can do — and only once Apple confirms approval should the
entitlement be re-added and the app rebuilt. Until then, `SsdpDiscoveryProvider.ts`'s code ships as-
is (it's a pure JS/UI concern) but its actual UDP sends will fail at runtime on iOS specifically
(caught, degrading to "nothing found," never a crash) — Android needs no such approval and should
work correctly as soon as a build with the code above is installed.

## Verification

New tests: `SsdpDiscoveryProvider.test.ts` (9 tests — real STs matched, Yamaha's weaker
server-string requirement, unrecognized ST ignored, non-200 ignored, same-device dedup, graceful
bind failure), `scanAllProviders.test.ts` (6 tests — multi-provider merge, hwaddr-preferring
dedup, one provider failing doesn't affect the other, both failing resolves empty). `react-native-
udp` has no native module to exercise in Jest, so these mock the socket at the same `EventEmitter`
level the real library's documented public API uses. Full suite: 37 suites / 390 tests passing,
`tsc --noEmit` clean. **Not yet verified against a real device on either platform** — this is a new
native module requiring a real rebuild, and the iOS entitlement isn't granted yet at all.

## Consequences

- This is the first native (non-JS, non-OTA-shippable) dependency added in pursuit of the "Pi as
  supplement, not requirement" principle — any future change to `SsdpDiscoveryProvider.ts` needs a
  full rebuild, not just an `eas update` push.
- If `react-native-udp` ever breaks against a future RN/iOS/Android version with no upstream fix
  forthcoming (a real, accepted risk given its dormancy), the fallback is exactly what existed
  before this ADR: FCC-based discovery, or manual IP entry — nothing about this change removes
  either of those paths.
- Yamaha's SSDP match is real but weaker than the other four brands (generic ST + string-matching)
  — worth revisiting if it produces false positives/negatives on real hardware.

## Addendum (same day, later): the accepted risk above happened — react-native-udp doesn't support Expo SDK 57's mandatory New Architecture

Live on Sean's iPhone (surfaced first through the PS5 driver, which used the same library — see
ADR-HEARTH-099's own addendum for the full diagnosis): `dgram.createSocket` genuinely resolves to
`null` at runtime. Root cause confirmed against the library's own known issues and Expo's SDK 57
changelog: React Native's New Architecture is mandatory as of SDK 55+, with no opt-out, and
`react-native-udp` (dormant since January 2023, already flagged above) never added support for it.

This retroactively corrects something misdiagnosed earlier in this same session: "SSDP has found
nothing all day" was attributed entirely to Apple's multicast entitlement not being granted yet.
That's real and still a separate gate for later, but it was never the whole story — the native
module fails to register at all under this Expo SDK, independent of any entitlement.

**Fix**: `SsdpDiscoveryProvider.scan()` now wraps the entire native attempt (including
`dgram.createSocket()` itself, which previously ran unguarded) and falls back to Family Command
Center's own server-side M-SEARCH sweep (`ssdp-scanner.ts` there, that project's own
`adr/0175-hearth-ssdp-scan-fallback.md`) whenever the native path fails outright — a real Node
process has no React Native native-module concerns at all. This is a fallback, not a replacement:
the native attempt always runs first and stays preferred for whenever a genuinely
New-Architecture-compatible, cross-platform UDP library exists (checked live: the one candidate
found, `react-native-udp-turbo`, is explicitly Android-only right now, so not a real fix for iOS
today).

**Consequences of this addendum:**
- SSDP-based discovery is now functionally restored via the Family Command Center relay — a real,
  if imperfect, improvement over "silently finds nothing," and consistent with this file's own
  earlier statement that FCC-based discovery is the natural fallback if this library ever broke.
- This does mean SSDP-sourced suggestions once again depend on Family Command Center being paired
  — a partial, honest retreat from "zero Pi dependency" for the specific case where the native
  library doesn't work, not a reversal of the underlying principle (native is still tried first,
  always).
- New tests added to `SsdpDiscoveryProvider.test.ts` (3 more — native-crash-triggers-fallback,
  native-success-skips-fallback, fallback-itself-degrades-safely-when-FCC-unconfigured). Full
  suite: 43 suites / 443 tests passing, `tsc --noEmit` clean.
- **Not yet confirmed with a real positive SSDP match** through either the native or fallback
  path — the fallback's own server-side scanner found zero devices in its first live test (see
  Family Command Center's own ADR 0175), most likely because no target device was in an
  SSDP-responsive power state at that exact moment, not a remaining bug.
