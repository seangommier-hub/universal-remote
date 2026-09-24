# ADR-HEARTH-128: Add Leah's iPhone; both phones share one build and one OTA channel

**Date:** 2026-09-24
**Status:** Accepted, build in progress

## Context

Sean: "leahs phone is plugged in, please install hearth and then push every update to her as well
as me." Her iPhone (UDID `00008150-000A154A363A401C`) was detected over USB on the Windows machine
(distinct from Sean's `00008150-000445E81A78401C`). ADR-HEARTH-082 anticipated this: register the
device, regenerate the ad hoc profile, rebuild `preview`.

## Decision

1. Registered the device through the App Store Connect API (new single-purpose script
   `scripts/ios-credentials/registerDevice.js`) instead of `eas device:create`, which needs an
   interactive terminal and a registration link opened on the phone. Then ran
   `regenerateProvisioningProfile.js`; the ad hoc profile now covers both phones.
2. Built one `preview` binary (`com.hearthremote.app`, runtime 1.1.0) for both phones. Installed via
   the EAS install link opened in Safari on her phone, since an ad hoc `.ipa` cannot be pushed over
   USB from Windows without an admin-only tool (see the Sideloadly dead end in memory).
3. "Push every update to her as well as me" needs no extra step: both phones run the same
   `preview` build tracking the `preview` channel/branch, so every
   `eas update --branch preview --environment preview --non-interactive` reaches both. Never `--auto`
   (ADR-HEARTH-107). Any native-module change requires a new build re-installed on both phones, and
   a `version` bump.

## Consequences

- Sean's existing binary keeps working (its embedded profile is unchanged); only Leah's needs the
  new build. Future new devices repeat steps 1 and 2.
- Her Family Command Center pairing is per-phone (settings are stored on-device), so she must enter
  the address/token once, on first launch.
