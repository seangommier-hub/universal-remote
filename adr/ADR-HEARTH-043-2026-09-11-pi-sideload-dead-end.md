# ADR-HEARTH-043: Pi-based AltServer-Linux sideload — confirmed dead end

Date: 2026-09-11

## Status

**Abandoned.** Apple's own auth servers reject this specific unofficial
client outright (`503` on every attempt, regardless of password or
anisette source). No config change fixes this; the upstream project has
had no real code change since 2022.

## Context

The official Windows/Mac AltServer path ([[hearth-windows-not-admin]],
ADR-HEARTH-031) is blocked: Sean's Windows account can't install the
Apple Mobile Device Support driver AltServer needs, and this is a genuine
Windows OS constraint (driver installation always requires admin — every
sideloading tool, AltServer or Sideloadly or otherwise, hits this
identically the first time it needs USB access to an iPhone on a machine
where that driver was never installed).

Sean, directly: "i only have the pi and that is what it is going to run
on. i am not putting it on another computer. i can migrate to a server
down the road." This closed off the alternative (finding any other
machine with real admin rights) that was offered and flagged as lower-risk
first. Also, separately and standing: "from now on this project and
anything on the [Family Command Center] needs to be done on the pi 5" —
see [[feedback_pi5_dev_target]].

The Pi has full, unrestricted sudo (unlike the Windows machine), so tried
`NyaMisty/AltServer-Linux` — an unofficial, reverse-engineered Linux port
of AltServer, with a prebuilt `aarch64` binary that runs natively on the
Pi 5.

## What was built (all working, none of it is the problem)

- `usbmuxd`, `libimobiledevice-utils`, `ideviceinstaller` via apt (full
  sudo, no admin wall) on `192.168.1.172`.
- `AltServer-aarch64` v0.0.5, downloaded to `~/altserver/` — confirmed
  statically linked (no glibc mismatch), runs cleanly on Debian
  13/trixie.
- iPhone physically connected via USB, paired and trusted — confirmed
  with a full `ideviceinfo` dump (UDID `00008150-000445E81A78401C`), not
  just USB enumeration.
- An anisette server (Apple device-identity data AltServer needs to talk
  to Apple's auth API) — tried **two independent, healthy sources**:
  self-hosted `dadoum/anisette-v3-server` in Docker on the Pi, and the
  actively-maintained hosted `https://ani.sidestore.app`. Both return
  valid, correctly-formatted anisette JSON.
- `Hearth-unsigned.ipa` (from the now-working CI pipeline, ADR-HEARTH-031)
  copied onto the Pi.

## What's actually broken

Every install attempt — with a real password, an empty password, and a
dummy password, across both anisette sources — fails identically at the
exact same step:

```
Building anisetteData obj...
...
Received auth response status code: 503
Alert: Could not install Hearth-unsigned.ipa to unknown.
    Server returned invalid response.
Error: com.rileytestut.ALTAppleAPI (17).
```

This happens at Apple's actual sign-in (GSA) endpoint, immediately after
anisette data is built — before the password would even meaningfully
matter (confirmed: byte-identical failure with no `-p` at all). A `503`
that's reproducible across two different, correctly-functioning anisette
sources and independent of password strongly indicates Apple's servers
are rejecting the client itself, not a credential or config problem.

**Why:** this binary hardcodes a fake device fingerprint from 2022 —
`X-MMe-Client-Info: <MacBookPro13,2> <macOS;13.1;22C65>
<com.apple.AuthKit/1 (com.apple.dt.Xcode/3594.4.19)>` — note Xcode build
`3594.4.19` is from roughly 2017, inconsistent with "macOS 13.1" (2022),
which was already an odd hardcoded value even at release. Checked the
upstream repo directly: its only commits since the 2022 `v0.0.5` release
are an automated `[proj] keepalive-workflow auto commit` bot ping — no
real code has changed. Two open issues from as recently as
2025-12/2026-01 (`#128`, `#130`) hit the *anisette* layer's stale default
URL, which the same fix here (a working anisette server) also resolves
for them — but nobody in that repo's issue tracker has reported or fixed
this specific `503`/`ALTAppleAPI (17)` auth-stage rejection. This is
consistent with Apple's auth infrastructure having tightened
fingerprint/protocol validation sometime in the ~4 years since this
project saw real maintenance, in a way an abandoned client can't recover
from without a real code fix nobody is making.

## Consequences

- **Do not re-attempt `NyaMisty/AltServer-Linux` in a future session**
  without genuinely new evidence (a real, non-bot commit fixing auth, or
  a different, actively-maintained fork that specifically addresses this
  `503`/error-17 symptom — not just the already-solved anisette-502
  issue). Retrying with a different Apple ID, a different anisette
  server, or more debug flags won't help; this was already isolated to
  the auth request itself, independent of both of those variables.
- The credential-handling approach used here (a one-time local web page
  on the Pi with a password field, output logged server-side but the
  password itself never written to disk/log, dropped from memory
  immediately after use) worked exactly as intended from a security
  standpoint — it just couldn't succeed against a broken auth call.
  Reusable pattern for a future credential-needing step on the Pi, if a
  working signer is found. Prefer this or the existing
  `set-<service>-credentials.sh` + `.env` pattern
  ([[feedback-credential-boundary]] in the Family Command Center project)
  over asking Sean to SSH in and use `tmux` directly — he doesn't always
  have the SSH key/client handy on whatever device he's using.
- Real remaining paths, in order of reliability:
  1. **Apple Developer Program approval** ([[hearth-apple-developer-pending]]) —
     re-checked live today (`npx eas-cli device:list`), still not
     approved. Once it is, EAS Build's cloud pipeline needs no local
     admin rights at all (it's not local to any machine), and its
     "internal distribution" delivers a real Apple-signed OTA install
     link Sean opens directly in Safari — no AltServer, no USB, no Pi
     involvement needed for install at all. This remains the cleanest
     path once approved.
  2. Sign via an **actively-maintained** tool instead of an abandoned
     one — e.g. `fastlane` (`cert`/`sigh`), which is kept up to date with
     Apple's changing auth requirements, run from GitHub Actions using
     Sean's Apple ID as a repo secret (never seen by Claude), then
     deliver over Wi-Fi/Safari via an `itms-services://` OTA link. Real
     new security surface (Apple credentials in CI) not yet built or
     agreed to — would need its own ADR-GLOBAL-002 decision point before
     starting.
  3. SideStore's actual current architecture (distinct from AltServer
     entirely) — not investigated; would be new work, not a quick fix.

## Related

[[hearth-apple-developer-pending]], [[hearth-windows-not-admin]],
[[feedback_pi5_dev_target]], ADR-HEARTH-031
