# ADR-HEARTH-095: SSDP discovery — native device finding with zero Pi dependency

**Date:** 2026-09-19
**Status:** Accepted, implemented; blocked on Sean's own Apple entitlement request to fully work on iOS

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
- **Native config**: `com.apple.developer.networking.multicast` entitlement declared in
  `app.config.js` (iOS gates raw multicast behind this specifically — separate from
  `NSLocalNetworkUsageDescription`, ADR-HEARTH-090, which doesn't cover multicast). Android gets
  `CHANGE_WIFI_MULTICAST_STATE` (without it, WiFi chips silently filter multicast frames as a
  battery-saving default even with a working socket).

## What Sean still needs to do himself

**Apple must separately approve this entitlement** — declaring it in the app config is necessary
but not sufficient. Sean has to submit a request himself at
`developer.apple.com/contact/request/networking-multicast`; this is not something any tool or
script can do on his behalf, and approval is discretionary, not guaranteed. Until granted, SSDP is
expected to fail to bind/send on real iOS hardware — caught and treated exactly like FCC being
unconfigured (silently nothing found, never a crash or error the user sees). **Android has no
equivalent gate** and should work as soon as the permission above is granted, which happens
automatically at install.

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
