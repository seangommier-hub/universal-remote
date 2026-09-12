# ADR-HEARTH-044: SideSign on the Pi — full login works, 2FA verification blocked by HTTP 434

Date: 2026-09-11 / 2026-09-12

## Status

**Paused, not abandoned.** A real, working, currently-maintained free-Apple-ID
signing pipeline now runs natively on the Pi 5 — a major result after
ADR-HEARTH-043 confirmed the previous (NyaMisty/AltServer-Linux) approach was
a dead end. It gets all the way through a real password authentication
against Apple's live servers and successfully triggers a real 2FA push to
Sean's trusted devices. It fails at the very last step — verifying the 6-digit
code — with a non-standard `HTTP 434` from Apple, reproduced identically
across three real attempts with three different real, freshly-generated
codes. One candidate fix has been applied and built but is **unverified**:
Sean has declined further live login attempts (real risk of Apple's
`tooManyAttempts` account lockout with more failures), so this is left ready
for whenever he wants to try again — not to be re-attempted without his
explicit go-ahead.

## What's built and confirmed working

On the Pi 5 (`192.168.1.172`), natively (no Docker) at
`~/SideSign/.build/release/sidesign`:

- **Swift 6.3.3 toolchain installed natively** via a direct `curl` of the
  Debian 12 aarch64 release tarball to `~/swift-toolchain/` (swiftly's own
  downloader repeatedly hit `HTTPClientError.readTimeout` on this network;
  raw curl with `--retry` succeeded). Chosen over Docker specifically because
  the Pi's own host libcurl (8.14.1, trixie) has WebSocket support that the
  `swift:6.3.3-bookworm` Docker image's bundled libcurl (7.88.1) lacks —
  `sidesign`'s remote-provisioning path needs a WebSocket-capable libcurl.
- **`SideStore/SideSign`** (an actively-maintained Swift CLI — commits from
  literally the same day this was built — implementing the real, current
  free-Apple-ID "Personal Team" signing protocol: GSA/SRP auth, Developer
  Portal device/cert/profile management, and IPA resigning) cloned and built
  from source at `~/SideSign/`.
- **Real ADI libraries** (`libCoreADI.so`, `libstoreservicescore.so`) for
  on-device anisette generation, extracted from Apple's own official Android
  Apple Music APK (`https://apps.mzstatic.com/content/android-apple-music-apk/applemusic.apk`
  — legitimate, official, publicly downloadable; this is the standard,
  community-established way every current SideStore-ecosystem tool gets
  these) into `~/SideSign/data/adi/`. Run via `AnisetteKit`'s Unicorn-engine
  ELF emulator — confirmed working, produces valid, Apple-accepted anisette
  headers.
- **Apple's real "Apple Root CA"** (fingerprint-verified against the
  official cert at `https://www.apple.com/appleca/AppleIncRootCertificate.cer`)
  added to the Pi's system trust store. Needed because `gsa.apple.com`
  chains to this CA, which isn't in Debian's default public-web CA bundle
  (Apple restricts it to Apple-internal service auth, not general HTTPS) —
  without it, every request to Apple's auth servers fails TLS verification
  with "self-signed certificate in certificate chain". This is the correct
  fix (trusting a real, verified Apple root), not a workaround.
- **A PTY-driven (`pexpect`) local web dialog**
  (`~/SideSign/sidesign_login_flow.py`, served on `:8765`) for the
  password/2FA entry, so Sean's Apple ID password and the 2FA code are typed
  directly by him into a page on his own phone — never through Claude, never
  in `ps` output. (First version used a plain `subprocess.Popen` pipe and
  hung silently at `sidesign`'s secure-input prompts, which need a real TTY;
  switching to `pexpect`'s PTY fixed that outright.) Confirmed dummy-password
  tests (no real credentials) validated the exact prompt sequence before any
  real attempt: local `machine.dat` encrypt/decrypt prompt **before** the
  real Apple ID password prompt (not after, as initially assumed), then 2FA
  method selection, then the code prompt.
- **Real login confirmed working end-to-end through 2FA trigger**: Sean's
  actual password authenticated successfully (`SRP` complete, Apple's own
  server issued a real `trustedDeviceSecondaryAuth` challenge) and the push
  reached his trusted device(s) — three separate times, with three different
  real 6-digit codes.

## What's failing

Every 2FA code submission — three real codes, three real attempts — fails
identically:

```
2FA verification failed (HTTP 434): Apple service returned an unexpected error (HTTP 434). - body:
```

Empty response body, fast turnaround — the same signature the AltStore team
documented for Apple's edge dropping a request before it reaches the real
auth service (see below), not a real "incorrect code" response (which has
its own distinct, different error path in this codebase returning a
specific `errorCode`/message, not this generic empty-body fallback).

## Root cause hypothesis (unverified)

Found a real, very recent (this week) precedent:
[altstoreio/AltStore#1790](https://github.com/altstoreio/AltStore/pull/1790)
— "Fix Apple ID sign-in failing with HTTP 503 (Apple blocks the hardcoded
Xcode client identifier)". Apple's auth edge started rejecting any request
whose `X-MMe-Client-Info` header identifies the client as
`com.apple.dt.Xcode`, rigorously isolated by the AltStore maintainer via
elimination testing (version number, User-Agent, HTTP version, connection
reuse, edge IP — none of those mattered; only that one substring in that one
header did).

**Important caveat**: our `X-Mme-Client-Info` header already reads
`com.apple.akd/1.0` (from `AnisetteKit`'s real, current Unicorn-emulated ADI
library output) on *both* the successful init call and the failing validate
call — it does not contain the blocked string at all. So this isn't a
byte-for-byte match to the AltStore bug; the AltStore team's own testing
found *only* that one header/substring mattered for *their* endpoint
(`GsService2` init). Our failure is on a different endpoint
(`GsService2/validate`) with a different status code (434, not 503) — Apple
may apply different, endpoint-specific rules there, plausibly *because*
`/validate` is a much higher-value target for 2FA-bypass abuse than the
init call.

The failing `/validate` request carries two other Xcode-identifying strings
that are **absent from the successful init call**:
- `X-Apple-App-Info: com.apple.gs.xcode.auth` (`Constants.GrandSlam.authApp`
  in `Sources/Constants.swift`)
- `X-Xcode-Version: 26.0` (a header that doesn't exist at all on the
  successful call)
- `User-Agent: Xcode` (`Constants.DeveloperServices.userAgent`) — note this
  literal *is* what real Xcode legitimately sends to developer-services
  endpoints in other known contexts, so changing it carries real risk of
  breaking a value Apple's server actually expects, not just fixes a block.

**Patch applied and built** (not yet tested): `Sources/Constants.swift` line
17, `GrandSlam.authApp` changed from `"com.apple.gs.xcode.auth"` to
`"com.apple.gs.akd.auth"`, matching the AltStore fix's pattern of
substituting `akd` (the real macOS daemon that performs this call) for the
blocked Xcode identifier. Rebuilt successfully
(`~/SideSign/.build/release/sidesign`, native Swift toolchain, ~65s
incremental build).

**Attempted to verify without a live login** (per Sean's explicit refusal to
sign in again): replicated the AltStore team's own verification technique —
hitting `https://gsa.apple.com/grandslam/GsService2/validate` directly with
fake credentials, comparing the old vs. patched `X-Apple-App-Info` value.
**Inconclusive** — a minimal request returned `404` both ways (missing
required session-specific headers to even reach the relevant code path), and
a fuller replica with a fake `X-Apple-Identity-Token` returned `200`
(empty body) both ways. This endpoint's edge behavior could not be
distinguished without a real, live, cryptographically valid identity token
tied to an actual in-progress SRP session — which only exists during a real
login attempt.

## Decision

**Do not attempt another real login without Sean explicitly asking.** Three
real attempts have already failed at the same step; per
`GrandSlamAuthErrorCodes.tooManyAttempts` existing as a real, explicit error
case in this codebase, repeated failures risk a genuine Apple-side account
lockout, which would be strictly worse than the current state.

When Sean is ready to try again:
1. The Pi is fully staged: `ssh -i ~/.ssh/id_ed25519_pi seangommier@192.168.1.172`,
   then `cd ~/SideSign && python3 sidesign_login_flow.py` (kill anything on
   `:8765` first with `fuser -k 8765/tcp`).
2. QR/URL: `http://192.168.1.172:8765/`.
3. If the patched `authApp` value fixes it: proceed to the next real
   milestone — device registration, cert creation, provisioning profile
   download, and signing `Hearth-unsigned.ipa` with `sidesign sign`.
4. If it still fails with the same `434`: the next candidates, in order of
   confidence, are (a) also changing `Constants.DeveloperServices.userAgent`
   away from the bare `"Xcode"` literal despite the risk noted above, or (b)
   removing/renaming the `X-Xcode-Version` header entirely from the
   `/validate` request in `Authentication.swift` — both untested, both
   directly informed by this same investigation, don't re-derive from
   scratch.
5. Consider filing this exact `434` symptom as an issue on
   `SideStore/SideSign` — a very actively maintained project (multiple
   commits daily) that may already have or quickly find the real fix, given
   how fresh Apple's blocking behavior is (this week).

## Related

ADR-HEARTH-043 (the prior, confirmed-dead-end Pi sideload path),
[[feedback_pi5_dev_target]], [[hearth-apple-developer-pending]]

## Update 2026-09-12: patched header got past 434, but a new error appeared — root cause found and fixed, unverified

The `authApp` header patch from this ADR's original write-up worked: a real
attempt this morning got a genuine `-21669` ("Incorrect verification code")
response instead of `434` — proof the endpoint now accepts the request at
all. A follow-up attempt with the correct code got **past 2FA entirely**
("2FA code verified successfully!") for the first time ever, then failed at
the very next step — a full re-authentication SRP handshake the CLI runs
immediately after 2FA to obtain real session tokens — with a new, different
error: `-22413: This Action Cannot Be Completed`. Not documented anywhere
(checked SideStore/SideSign's GitHub issues directly: none exist yet for
this code; checked AltStore/AltServer forks: only the cosmetically similar
but distinct `-22411` appears, itself undocumented).

**Root cause found:** `sidesign_login_flow.py` was answering sidesign's
"Enter password to encrypt/for device data" prompt (the local `machine.dat`
device-identity cache, handled by `CLI/DeviceDataManager.swift`) with a
blank line. `CommandHandler.swift`'s `guard ... !entered.isEmpty else`
around every `DeviceDataManager.load`/`.save` call means a blank answer
silently skips persistence entirely — confirmed directly: `data/adi/`
never contained anything but the two static ADI `.so` libraries, and
`~/.sidesign/session` reported "No saved sessions found" even after a
2FA-verified run. Every single login attempt was therefore minting a
brand-new random device identity from scratch (confirmed: `X-Mme-Device-Id`
differed between the 00:19 and 00:34 runs tonight, e.g.
`E0293E43-1ED8-4ABF-B069-D8249E03E21F` vs `A5EE3EFE-6464-4795-A604-A4A8106FC101`)
— consistent *within* one process run, but a fresh throwaway "device" on
every new run. Apple's fraud detection almost certainly treats "a
never-before-seen device jumping straight to a sensitive
final-authentication step, repeatedly, same account, same evening" as
exactly the pattern `-22413` exists to block.

**Fix applied:** `sidesign_login_flow.py` now generates a random 32-byte
passphrase once (`~/.sidesign_device_passphrase`, `chmod 600`, plain file —
this only encrypts a local device-identity cache at rest, it's not an Apple
credential, same risk class as the SSH key already on this Pi) and sends
that instead of a blank line at the device-data prompt. `machine.dat`
should now persist and be reused across runs, giving Apple one consistent,
increasingly-trusted device identity instead of a new one every attempt.

**Status: fix deployed, not yet verified against a real login** — the next
real attempt (whenever Sean runs it) is the actual test. If `-22413`
recurs even with a persisted device identity, the next candidates are (a)
whether the retry-authenticate step needs to carry forward a session
cookie/header from the 2FA verification response that it currently drops,
or (b) filing the exact symptom upstream with SideStore/SideSign now that
it's cleanly reproducible.

## Related (cont.)

[[hearth-sidesign-device-persistence-fix]]
