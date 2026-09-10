# ADR-HEARTH-031: Unsigned CI build + AltStore sideload as an interim path to a real iOS app

Date: 2026-09-10

## Status

Accepted — interim path while the Apple Developer Program enrollment
([[hearth-apple-developer-pending]]) is still pending.

## Context

Sean: "keep going and figure out how to get this on the iphone." A real
(non-Expo-Go) install on his iPhone has been researched extensively this
session and confirmed to need one of: (a) EAS Build's cloud iOS pipeline,
which requires an active Apple Developer Program membership to sign for a
specific device — confirmed directly via `eas-cli build --platform ios`
returning "You have no team associated with your Apple account" — or (b)
local Xcode on a Mac, which this environment doesn't have.

Re-checked today before doing anything else: `eas-cli device:list` still
returns "No Apple teams found for account seangommier" — the Apple
Developer Program enrollment is still not approved. Memory updated
accordingly, see [[hearth-apple-developer-pending]].

Researched a path that doesn't depend on either of those: AltStore /
AltServer sideloads apps using nothing but a free Apple ID — no paid
enrollment — by requesting a personal-team signing certificate from
Apple's own developer services (the same free mechanism Xcode's "Devices
and Simulators" personal-team signing uses), and re-signs the app every
7 days to keep it running past the free certificate's expiry. AltServer
has a Windows build, so it doesn't require a Mac either. What AltServer
does NOT do is compile source — it only re-signs an already-built `.app`/
`.ipa`. The missing piece is getting that unsigned `.app` built at all
without a Mac: GitHub Actions' free-tier `macos-14` runners come with
Xcode preinstalled and don't require any Apple account to run — building
with `CODE_SIGNING_ALLOWED=NO` produces a valid unsigned `.app` with no
Apple credentials involved at all.

## Decision

Chain these two independent, already-free pieces together:

1. **`.github/workflows/ios-unsigned-build.yml`** — on a GitHub Actions
   `macos-14` runner: `expo prebuild --platform ios` to generate the
   native project, `pod install`, then `xcodebuild ... CODE_SIGNING_ALLOWED=NO`
   to produce an unsigned `.app`, zipped into `Hearth-unsigned.ipa` and
   uploaded as a workflow artifact. No Apple account touches this step.
2. **AltServer on Sean's Windows PC** signs that unsigned `.ipa` using
   his free Apple ID (`seangommier@gmail.com`) and installs it directly
   to his iPhone over Wi-Fi/USB — this is the step covered by the
   [[hearth-windows-not-admin]] constraint (AltServer's installer
   typically needs iTunes + Apple Mobile Device drivers, which usually
   need admin rights Sean's AzureAD-managed account doesn't have). Sean
   confirmed via AskUserQuestion he wants to attempt this anyway and hit
   that wall directly if it comes up, rather than pre-verifying elsewhere.

Sean also confirmed (AskUserQuestion) this session's ~65 files of
uncommitted work should be committed to a new branch
(`feature/ios-unsigned-build`), not `main`, specifically so this CI
experiment doesn't touch the main branch — logged per ADR-GLOBAL-002.

## Consequences

- Known, accepted limitation vs. a paid account: the sideloaded app stops
  working after 7 days unless AltServer reconnects to the phone on the
  same Wi-Fi to re-sign it. This is materially worse than EAS Build's
  1-year signing once the Apple Developer Program is approved — this is
  explicitly an interim path, not a replacement for finishing that
  enrollment.
- New risk surface not yet validated: whether `expo prebuild` cleanly
  generates a native project for every native module this app currently
  pulls in (camera, secure-store — both already in `app.json`'s plugin
  list), and whether AltServer's installer actually succeeds without
  admin rights on Sean's machine. Both are open until tested for real.
- If AltServer's installer is blocked by the missing admin rights, the
  fallback is either finding a machine Sean does have admin on, or
  simply waiting for Apple Developer Program approval and using the
  already-configured `eas.json` development profile instead.

## Related

[[hearth-apple-developer-pending]], [[hearth-windows-not-admin]]
