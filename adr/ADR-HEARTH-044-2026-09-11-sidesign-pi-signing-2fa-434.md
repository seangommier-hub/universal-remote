# ADR-HEARTH-044: SideSign on the Pi — full login works, 2FA verification blocked by HTTP 434

Date: 2026-09-11 / 2026-09-12

## Status

**Signing in is solved.** The 2026-09-13 update below confirms a real login completed end to end
on the Pi — Apple issued a real developer-portal session, `fetchAccount`/`fetchTeams` succeeded,
and the CLI persisted `session_ZR2575A26A.dat`. Remaining work is downstream of auth entirely:
device registration, cert/profile provisioning, and `sidesign sign` on `Hearth-unsigned.ipa` — see
[[ADR-HEARTH-044]]'s own next-steps list, now starting from a logged-in session instead of zero.

## Status (superseded, kept for history)

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

## Update 2026-09-13: device persistence confirmed working, but -22413 now blocks the *initial* login, before 2FA is even triggered

Ran a real login attempt (Sean's go-ahead given this session). `~/.sidesign/session/machine.dat`
kept its 2026-09-12 08:48 timestamp through the run — confirmed the device-persistence fix from
the prior update is doing its job; this was not a fresh throwaway device identity.

Despite that, the outcome is a new, worse variant of the same error code. Full trace in
`~/SideSign/login_result.log` on the Pi:

- Password entered, SRP auth (`init` → `complete`) succeeded — Apple's server returned a real
  `dsid` (`001003-10-a4f6b5cb-...`) and session token.
- Immediately after, before any 2FA push was sent or prompted: `Auth endpoint returned error
  code -22413: This Action Cannot Be Completed`. Process exited there.

This differs from the 2026-09-12 update's finding in an important way: previously, `-22413` hit a
*separate re-authentication SRP handshake that runs after a successful 2FA verification*. This
time, it hit right after the *first* SRP completion, with no 2FA step ever reached. Same error
code, different call in the sequence — this is not simply "the same bug, still unfixed"; the
failure point moved earlier, which the device-persistence fix does not explain and may not be
the relevant factor at all here.

**Working theory, unverified:** the persisted `machine.dat`/`~/.sidesign/session` already carried
state from the 2026-09-12 run that got past 2FA (i.e., in Apple's eyes this device previously
completed a 2FA-verified session on this account). `sidesign` may be detecting that existing
session state and attempting some kind of session-resume/re-validate call instead of a fresh
full login — and it's that resume-style call Apple is rejecting with -22413, consistent with the
prior update's still-untested hypothesis "whether the retry-authenticate step needs to carry
forward a session cookie/header from the 2FA verification response that it currently drops."
Not confirmed by code inspection yet.

**Did not re-attempt.** Four distinct rejections on this Apple ID in two days (`503`, `434`,
post-2FA `-22413`, now pre-2FA `-22413`) is exactly the pattern `tooManyAttempts` exists to catch.
Per this ADR's own standing decision, no further live login without Sean explicitly asking again.

**Next candidates, in order of confidence, before another live attempt:**
1. Inspect `CLI/DeviceDataManager.swift` / the auth flow in `Sources/` for what changes when
   `machine.dat`/session already exists vs. a genuinely fresh device — confirm or rule out the
   session-resume theory above by reading code, not by burning another real login.
2. Consider whether wiping `~/.sidesign/session/machine.dat` and `~/.sidesign/provisioning/*`
   (forcing a genuinely fresh device+session, at the cost of losing the persistence fix's benefit
   for one run) isolates whether stale session state is the trigger — this is itself a real login
   attempt once retried, so still needs Sean's go-ahead first.
3. File the exact symptom upstream on `SideStore/SideSign` now that both the post-2FA and
   pre-2FA variants of `-22413` are documented here with full traces — still no existing issue for
   either as of this session.

## Update 2026-09-13 (later): root cause found by code inspection — the authApp header patch was applied to the wrong call site too

Investigated the session-resume theory from the prior update by reading `Authentication.swift`
directly instead of retrying live. It doesn't hold up, and something more specific does.

**What `Authentication.swift` actually does after SRP `complete`:** `authenticate()` reads an `au`
field from Apple's response (`statusDictionary?["au"]`, line ~189). If it's
`trustedDeviceSecondaryAuth`/`trustedDevice`/`secondaryAuth`/`sms`/`voice`/`phone`, it runs 2FA,
then **recurses into `authenticate()` again**. If `au` is anything else (including absent —
`nil`, exactly what our two runs logged both times), the `switch` hits `default: break` and falls
straight through to fetching developer-portal app tokens (`fetchAuthToken`, line ~263) — no 2FA
requested at all. This explains the 2026-09-13 run directly: Apple didn't ask for 2FA this time
(its own choice, not a bug), so the code went straight to the apptokens fetch — and the
2026-09-12 post-2FA failure was the *same* apptokens fetch, just reached via the recursive call
after `handle2FARequest` succeeded. **Both `-22413`s are the same call failing, not two different
bugs** — the "separate re-auth handshake" description in the prior update was an inaccurate
characterization; there's only one `authenticate()` function, recursing at most once.

**Actual root cause:** `Constants.swift`'s `GrandSlam.authApp` is a single constant reused for two
unrelated purposes:
1. `Authentication.swift:263` — the `"app"` identifier in the apptokens request body/checksum,
   sent to Apple's *developer-portal* token endpoint. This legitimately needs to say
   `"com.apple.gs.xcode.auth"` — Xcode is the actual authorized client for pulling developer
   certs/tokens via GrandSlam apptokens; that's not the blocked identifier here at all.
2. `Authentication.swift:897` (`makeTwoFactorAuthRequest`, the *2FA validate* request only) — the
   `X-Apple-App-Info` header, which *is* the one Apple's edge blocks when it says `Xcode`
   (ADR-HEARTH-044's original `434` fix, confirmed still correct for this specific call).

The original 434 fix changed the shared constant to `"com.apple.gs.akd.auth"` globally, which
correctly unblocked (2) but broke (1): the apptokens endpoint is very plausibly rejecting `akd` as
an unauthorized requester for developer-portal tokens with `-22413` ("This Action Cannot Be
Completed" reads exactly like an authorization/entitlement-tier rejection, not a malformed-request
one) — consistent with -22413 appearing only *after* auth otherwise succeeds (real `dsid`+token
issued), at the very next step that uses this identifier.

**Fix applied and rebuilt** (`swift build -c release`, 89.79s, clean): split the single constant
into two — `Constants.GrandSlam.authApp` restored to `"com.apple.gs.xcode.auth"` (used only at the
apptokens call site), and a new `Constants.GrandSlam.twoFactorAppInfo = "com.apple.gs.akd.auth"`
(used only in `makeTwoFactorAuthRequest`'s `X-Apple-App-Info` header). Also had to add the new
field to the mirrored `SideSignHeaders.GrandSlam` runtime struct in `SideSignHeaders.swift`, which
duplicates `Constants.GrandSlam`'s fields with its own initializer defaults — build failed until
this second struct got the field too, which is how it surfaced that both places needed it in the
first place.

**Not yet tested against a real login** — this is purely a code-derived fix; no Apple-side
verification has been attempted this round, per pausing after the last update. If the theory is
right, a real attempt should now get through the apptokens step and reach account/cert/device
registration for the first time.

## Update 2026-09-13 (later still): confirmed live — the header-split fix works, login is fully solved

Sean ran a real attempt (via a QR code to `sidesign_login_flow.py`, scanned on his own phone —
password/2FA typed by him, never seen by Claude). Full trace in `~/SideSign/login_result.log`:

- SRP auth completed, Apple returned `au: nil` again (no 2FA challenge this run).
- Apptokens fetch **succeeded**: `Successfully obtained auth token for app: com.apple.gs.xcode.auth`.
- `fetchAccount` succeeded (Sean Gommier, `seangommier@gmail.com`).
- `fetchTeams` succeeded: one team, "Sean Gommier" (`ZR2575A26A`), Xcode Free Provisioning Program.
- Session persisted: `~/.sidesign/session/session_ZR2575A26A.dat` and `machine_ZR2575A26A.dat`.
- Final line: `Logged in as: Sean Gommier (DSID: 166693018 (Team: ZR2575A26A))`.

**This confirms the prior update's root-cause fix (splitting `authApp` from `twoFactorAppInfo`)
was correct.** Zero errors this run, at any step.

**However, Sean reported this as a failure** — the web UI showed "Login did not reach 2FA (wrong
password, or another error above)", which is wrong; the real CLI process succeeded completely.
Root cause: a bug in `sidesign_login_flow.py` itself (the Python/pexpect wrapper around the CLI,
not `sidesign` or Apple). After sending the password, it only expected a 2FA method-selection
prompt (`Select option [1-3]:`) or a wrong-password message — it had no branch for the CLI
finishing the login and printing `Logged in as: ...` directly (which is what happens whenever
Apple doesn't challenge 2FA, as in both of today's runs). That case fell through to
`pexpect.EOF`, which the script's `else` branch mislabeled as "did not reach 2FA."

**Fixed:** added an explicit `"Logged in as"` branch to the `pexpect.expect(...)` call at the
password-submission step, so a no-2FA-needed success is now detected and reported correctly
instead of being misread as a failure. Patched, and the server was restarted running the fixed
version. Not yet re-verified against another real login (didn't want to spend one just to test
UI text after the CLI-level fix was already confirmed by direct log inspection).

**Consequence for future sessions:** don't trust "failure" as reported by the login flow web page
at face value if it happens right after password entry — always check `~/SideSign/login_result.log`
directly first, since the wrapper's own success detection has had at least one real gap.

## Update 2026-09-13 (final): signed IPA produced — one step (USB install) left

With a working session, drove the rest of the pipeline directly over SSH (no further Apple
credentials needed — everything from here uses the persisted session, not a live password/2FA):

- **`com.hearth.app` (the real bundle ID) is globally unavailable** — Apple error 9401,
  "not available," on `dev appids register`. This is Apple-side global uniqueness, unrelated to
  this account; some other developer already holds that exact string. Not fixable by retrying.
- **Found a pre-existing App ID already on this team**: `com.seangommier.hearthapp`
  (`F9A4DJ7D6K`), named "XC com seangommier hearthapp" — Xcode's own auto-naming convention for
  personal-team free provisioning. This predates this session; almost certainly a leftover from
  an earlier local Xcode/AltServer attempt, never previously connected to this signing effort.
- **Resigned to match it**: unzipped `Hearth-unsigned.ipa` (`sidesign archive unzip`), patched
  `Info.plist`'s `CFBundleIdentifier` from `com.hearth.app` to `com.seangommier.hearthapp` via
  Python's `plistlib` (binary plist, in place), repackaged (`sidesign archive zip`). This is a
  local-signing-only identifier swap — irrelevant to the real `com.hearth.app` used by the
  EAS/App Store build path in `app.json`; the two are unrelated once this IPA is signed.
- **Device registered**: `Sean iPhone` (UDID `00008150-000445E81A78401C`, from ADR-HEARTH-043's
  earlier `ideviceinfo` dump).
- **New development certificate created and exported** to `~/hearth-resign/hearth-dev.p12`
  (local p12 password `HearthPiSign2026` — a local file-encryption password Claude generated,
  same non-Apple-credential risk class as the device-data passphrase; not Sean's Apple ID
  password). Account now has 2 certs on the free tier (`fetchCertificates` reported 2) — likely
  1 leftover from the earlier attempt plus this new one; free/personal accounts cap at 2, so a
  future cert creation may need to revoke one first (`sidesign dev certs revoke <ID>`).
- **Provisioning profile downloaded** for `com.seangommier.hearthapp` (Xcode-managed Team
  Provisioning Profile, iOS App Development).
- **Signed and verified**: `sidesign sign` succeeded;
  `sidesign verify Hearth-signed.ipa` confirms `Signature is VALID`,
  `Identifier=com.seangommier.hearthapp`, `TeamIdentifier=ZR2575A26A`. File at
  `~/hearth-resign/Hearth-signed.ipa` (34.6MB) on the Pi.

**All non-interactive flags needed `--local ./data/adi` for Anisette** (same ADI libraries used
for login) and the device-data passphrase piped via `cat ~/.sidesign_device_passphrase |`, since
none of these commands run under the PTY wrapper `sidesign_login_flow.py` provides.

**Flag-name correction for future sessions**: the CLI's own `--help` examples are wrong for
`sign` — they show `-p secret` for the p12 *password*, but `FlagRegistry.sign` in `main.swift`
actually maps `-p` to `--p12` (the file path) and requires `--password`/`-pwd`/`-w`/`--pass` for
the actual password. Using `-p` for both caused a "P12 file does not exist: <password-string>"
error the first attempt. Use `--p12 <path> --password <pwd>` explicitly, not the short forms, to
avoid this ambiguity.

**Only remaining step: install `Hearth-signed.ipa` onto Sean's iPhone.** `usbmuxd`/
`ideviceinstaller` are already set up on the Pi (ADR-HEARTH-043) but the phone was not connected
via USB at the point this signing finished (`idevice_id -l` returned nothing, `lsusb` showed no
Apple device — usbmuxd's own log shows it disconnected at 02:30, auto-exiting per its
exit-on-no-devices config). Needs Sean to physically reconnect the phone to the Pi's USB port;
then `ideviceinstaller -i ~/hearth-resign/Hearth-signed.ipa` should install it directly, no OTA
HTTPS link or App Store involvement needed.

## Related (cont.)

[[hearth-sidesign-device-persistence-fix]]
