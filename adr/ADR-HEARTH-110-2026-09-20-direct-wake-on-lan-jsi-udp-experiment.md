# ADR-HEARTH-110: Real experiment — direct-from-phone Wake-on-LAN via react-native-jsi-udp

**Date:** 2026-09-20
**Status:** Accepted as an experiment; not yet verified against real hardware or a real device build

## Context

This project has repeatedly treated "`react-native-udp` doesn't support Expo SDK 57's mandatory
New Architecture" as a reason every UDP-broadcast feature (Xbox, PS5's original approach, SSDP,
Wake-on-LAN) had to move server-side onto Family Command Center. Sean pushed back on that framing
directly and correctly: "i think this is solvable. many of these huge companies have apps of their
own so clearly the tech is there" — and separately, on the broader architecture: "hearth is the
driver of the device commands as a primary and only source, family command center... is a nice to
have but not required." Family Command Center being *required* for Wake-on-LAN (a feature with no
inherent reason it can't run entirely on the phone) contradicts that principle, and was only true
because of a library-specific gap, not a real platform limitation — Sony's, LG's, and Roku's own
apps all do local-network device control directly from iOS, proving the underlying capability
genuinely exists.

Researched rather than assumed: `react-native-jsi-udp` (github.com/mybigday/react-native-jsi-udp)
is a real candidate — built on JSI (the actual foundation of the New Architecture, unlike
`react-native-udp`'s old bridge-based design), confirmed directly from its own source (not just its
README) to expose a genuine Node-`dgram`-shaped API: `createSocket`, `bind`, `send`,
`setBroadcast`, `addMembership`/`dropMembership` for multicast, with real `SO_BROADCAST` support
at the native layer. Honestly immature — 14 GitHub stars, 2 forks, thin documentation — a real,
disclosed risk unlike this project's other, well-established dependencies.

## Decision

- Added `src/core/network/wakeOnLanDirect.ts` — sends a real Wake-on-LAN magic packet directly from
  the phone's own WiFi radio using `react-native-jsi-udp`, no Family Command Center involved.
  Assumes a `/24` subnet (derived from the phone's own current IP via `expo-network`, zeroing the
  last octet) since `expo-network` doesn't expose a real netmask and `/24` matches every network
  in this household confirmed today (`192.168.1.0/24`, `10.20.30.0/24`) — a disclosed
  simplification, not a general solution for every possible home network.
- `src/core/network/wakeOnLan.ts`'s public `sendWakeOnLan(macAddress)` — the function every
  TV driver already calls, unchanged at the call-site level — now tries the direct-from-phone path
  **first**, falling back to Family Command Center's relay only if that fails. A device on the
  phone's own WiFi (the common case) now reaches Hearth as the sole, primary driver of the command,
  exactly matching the stated architecture; a device on a network segment the phone itself isn't
  joined to (an isolated Guest/IoT network, or the Pi's own separately-hosted AP) still needs the
  relay, for the same physical reachability reason every other relayed driver in this project
  already has — Hearth trying to reach a network it has no interface on is exactly as impossible as
  Family Command Center reaching one it has none on either (ADR-HEARTH-109's identical finding
  about the 192.168.200.x segment applies equally here).

## Consequences

- `npm audit` confirmed the new dependency introduces no new vulnerabilities (all existing moderate
  findings trace to the pre-existing Expo toolchain, unrelated to this package).
- `npx jest --silent` → 919/919 passing (9 new tests: 5 for `wakeOnLanDirect.ts`'s own packet-
  building/broadcast-address logic, mocking the native module directly since Jest has no real JSI
  bridge; 2 replacing/extending `wakeOnLan.test.ts`'s coverage for the new direct-then-relay
  fallback shape). `npx tsc --noEmit` clean.
- **This requires a real native rebuild to test at all** — unlike every other change shipped today,
  this cannot go out via `eas update` (a genuinely new native dependency) and cannot be verified in
  Expo Go (no JSI bridge for a custom native module there either). A live device test against real
  hardware is the only way to know if this actually works — not yet done as of this ADR.
- Honest risk disclosure: `react-native-jsi-udp` is a 14-star, thinly-documented library. This is a
  real experiment, not a validated fix — if it fails to link, crashes at runtime, or the broadcast
  silently doesn't reach real devices, the fallback to Family Command Center's relay (unchanged,
  already proven working) means no existing functionality regresses either way; worst case, this
  specific optimization simply doesn't pan out and every device continues going through the relay
  exactly as it does today.
- If this works, it's the first real crack in "every UDP-broadcast feature needs Family Command
  Center" — Xbox, SSDP discovery, and PS5-style broadcast-based approaches would all be legitimate
  candidates to revisit the same way, once this one experiment is actually confirmed against real
  hardware.
