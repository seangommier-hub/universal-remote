# ADR-HEARTH-110: Direct-from-phone Wake-on-LAN via react-native-jsi-udp — tried, root-caused two real bugs, reverted

**Date:** 2026-09-20
**Status:** Reverted. Underlying architectural direction still believed correct; this specific library was not viable.

## Context

This project had repeatedly treated "`react-native-udp` doesn't support Expo SDK 57's mandatory
New Architecture" as a reason every UDP-broadcast feature (Xbox, PS5's original approach, SSDP,
Wake-on-LAN) had to move server-side onto Family Command Center. Sean pushed back on that framing
directly and correctly: "i think this is solvable. many of these huge companies have apps of their
own so clearly the tech is there" — and separately, on the broader architecture: "hearth is the
driver of the device commands as a primary and only source, family command center... is a nice to
have but not required." Both points are correct in principle: Sony's, LG's, and Roku's own apps
all do local-network device control directly from iOS, so the underlying capability genuinely
exists — the gap was "no working New-Architecture-compatible library found yet," not a real
platform ceiling.

Researched rather than assumed: `react-native-jsi-udp` (github.com/mybigday/react-native-jsi-udp)
looked like a real candidate on inspection — built on JSI (the actual foundation of the New
Architecture), with a genuine Node-`dgram`-shaped API (`createSocket`, `bind`, `send`,
`setBroadcast`, `addMembership`) confirmed directly from its own source, not just its README.
Disclosed upfront as immature (14 GitHub stars, 2 forks, thin docs) before building anything.

## What was actually tried

1. Built `src/core/network/wakeOnLanDirect.ts` (real magic-packet sender using the library) and
   wired `sendWakeOnLan()` to try it before falling back to Family Command Center's relay.
   `npm audit` clean, `npx jest`/`tsc` clean — all appeared ready to test.
2. **First real build failure**: `pod install` failed outright —
   `Unable to find a specification for 'RCT-Folly' depended upon by 'react-native-jsi-udp'`.
   Root-caused by reading the actual build log (not guessed): React Native 0.86.3 no longer vends
   `RCT-Folly` as an installable pod at all (folded into a consolidated `ReactNativeDependencies`
   pod) — a real, current (2025-2026), ecosystem-wide compatibility gap also hitting
   `react-native-firebase` and `aws-amplify` against recent React Native versions, confirmed via
   their own GitHub issues, not unique to this project. Tried the documented workaround
   (`RCT_USE_PREBUILT_RNCORE=0`) — confirmed via the log that it genuinely disabled prebuilt-core
   this time, but the exact same Folly error persisted regardless, proving Folly is gone outright,
   not merely hidden behind prebuilt mode.
3. Read the library's actual `.mm`/`.podspec` source directly and confirmed `RCT-Folly`,
   `RCTRequired`, `RCTTypeSafety`, and `React-Codegen` were never referenced by any real code —
   stale boilerplate copied from an old TurboModule podspec template. Patched them out via
   `patch-package` (a durable, `postinstall`-applied patch, not a manual `node_modules` edit) —
   `pod install` succeeded on the next build.
4. **Second real build failure**, further along (a genuine Xcode compile error, not pod install):
   `'RNJsiUdpSpec.h' file not found`. Root-caused: `JsiUdp.h` declares
   `@interface JsiUdp : NSObject <NativeJsiUdpSpec>` and `JsiUdp.mm` constructs a real
   `facebook::react::NativeJsiUdpSpecJSI` — both symbols that only exist if React Native's Codegen
   generates them from a `codegenConfig` + TypeScript spec file. The library's own `package.json`
   has no `codegenConfig` at all — a genuine packaging gap, not vestigial boilerplate this time;
   properly fixing it means writing and validating a full TurboModule codegen spec for a library
   this project doesn't maintain, a materially bigger and riskier undertaking than the Folly patch.

## Decision

**Reverted the whole experiment** rather than continue sinking build cycles into it: removed
`react-native-jsi-udp` and `patch-package`, deleted `wakeOnLanDirect.ts`/its tests, restored
`wakeOnLan.ts` to relay-only, reverted the `app.config.js` version bump back to `1.1.0` (no native
change survives, so no new binary is needed). Two separate, real, unrelated compatibility bugs in
a row from the same library was a clear enough signal that it isn't production-ready against this
project's current React Native version, distinct from "the idea doesn't work."

## Consequences

- `npx jest --silent` → 913/913 passing (back to the pre-experiment count). `npx tsc --noEmit`
  clean. No lingering dependency, patch, or version-bump debt from the reverted attempt.
- The underlying architectural point Sean raised is unaffected by this specific library's failure:
  Hearth should be the primary driver, Family Command Center a reachability supplement — this
  ADR's honest conclusion is narrowly "this one dependency wasn't ready," not "the idea was wrong."
  HTTP-based drivers (Sony, Roku, Kasa, SmartThings, Hue) already satisfy that principle today via
  direct-connection-first/relay-fallback; UDP-broadcast features (Wake-on-LAN, Xbox, SSDP) remain
  the genuinely open gap.
- Two real, concrete paths remain open for revisiting this later, by choice rather than default:
  (a) properly write the missing TurboModule codegen spec for `react-native-jsi-udp` (or contribute
  it upstream) now that the exact, specific gap is known, or (b) build a small, purpose-built
  native module directly (Swift/Kotlin) scoped to exactly the UDP-broadcast primitive needed,
  avoiding a third-party dependency's own packaging maturity entirely. Neither was attempted here
  given the time already spent confirming the existing candidate's real limits.
