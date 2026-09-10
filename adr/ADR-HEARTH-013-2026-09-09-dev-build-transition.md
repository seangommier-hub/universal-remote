# ADR-HEARTH-013: Transition to Expo Development Build (Phase 3 start)

**Date:** 2026-09-09
**Status:** In progress — scaffolding done, blocked on Sean's Apple Developer enrollment

## Context

ADR-HEARTH-006's latest update confirmed, against real hardware, that
Sean's 75" LG TV actively rejects the unencrypted `ws://3000` webOS
protocol — it requires the encrypted `wss://3001` path, which uses a
certificate from LG's private CA. React Native's built-in `WebSocket`
cannot be configured to trust that certificate (no `rejectUnauthorized`
override, no custom trust-anchor hook). Samsung has the identical problem
(ADR-HEARTH-005). Both are blocked on the same root cause: Expo Go's JS
engine doesn't expose the native TLS layer needed to solve it.

Sean, directly, after this was explained: "then fix it." Asked one
clarifying question first per ADR-GLOBAL-002, since this is a real
infrastructure commitment, not a code change: confirmed proceeding now,
via EAS Build (this dev machine is Windows — no local Xcode, so iOS builds
must go through EAS's cloud build service, not a local `expo prebuild` +
Xcode run).

## Decision

Begin the Expo Development Build transition documented as Phase 3 in
`ROADMAP.md`, `docs/EXPO_COMPATIBILITY.md`, ahead of its original mDNS/SSDP
trigger — the LG/Samsung cert-trust problem forces the same transition
sooner. Concretely, done so far:

- `expo-dev-client` installed (SDK 57-pinned via `npx expo install`)
- EAS project created and linked: `@seangommier/hearth`
  (`https://expo.dev/accounts/seangommier/projects/hearth`), under Sean's
  personal `seangommier` EAS account (matches the "seangommier@gmail.com,
  aligned with Family Command Center" GitHub-account requirement from
  earlier in the project) — `app.json` now carries `extra.eas.projectId`
  and `owner`.
- `eas.json` added with `development` (internal distribution, real device
  not simulator), `preview`, and `production` build profiles.

**Not yet done, blocked on Sean:** Apple Developer Program enrollment
($99/yr, per-account not per-app — confirmed to Sean directly, covers
Hearth and any other app including CardDNA under one membership). EAS
cannot produce an installable iOS dev-client build for a physical iPhone
without it. Everything above was chosen specifically to not require it
yet, so this is the only remaining blocker before running a real iOS
build.

**Not yet scoped:** the actual certificate-trust mechanism once a Dev
Build exists — a native module or library (e.g. one offering a custom
`NSURLSessionDelegate`/Android `TrustManager` override, or a raw-TLS
library like `react-native-tcp-socket` with an explicit trust-anchor for
LG/Samsung's CA) still needs to be chosen and is real engineering work in
its own right, not unlocked automatically just by having a Dev Build.
Deliberately not started until a Dev Build actually exists to test it
against — building blind here risks exactly the kind of speculative,
untested work this project's rules prohibit.

## Rationale

Doing this now rather than waiting for the "real" Phase 3 trigger
(mDNS/SSDP) avoids solving the same native-build transition twice. The
scaffolding (dev-client dependency, EAS project, build profiles) has zero
dependency on the Apple account and is safe/useful regardless of which
cert-trust approach gets chosen later, so building it now doesn't waste
work if the specific TLS solution changes.

## Consequences

- Testing workflow changes once a real Dev Build exists: no more scanning
  a QR into Expo Go for iOS — a custom dev-client `.ipa` must be installed
  on Sean's phone (via EAS's internal distribution, a normal
  install-from-link flow once Apple Developer access exists), then `npx
  expo start --dev-client` connects to it the same way Expo Go did.
  Existing Expo-Go-compatible features (Sony, Roku, FCC discovery/relay,
  camera QR scan) all continue working unchanged in a Dev Build — Dev
  Build is a superset of Expo Go's capabilities, not a replacement
  requiring re-verification of what already works.
- CardDNA (sibling project, same Expo/EAS account) is unaffected — this
  work is scoped entirely to Hearth's own project (`@seangommier/hearth`),
  a separate EAS project from whatever CardDNA uses, sharing only the
  account-level free build-credit pool (flagged to Sean directly).
- Once Sean has Apple Developer access, next step is a real
  `eas build --profile development --platform ios` run — expected to
  surface its own issues (provisioning profile / device registration)
  that aren't fully predictable until attempted for real, consistent with
  this project's "verify against reality, don't assume" pattern throughout.
