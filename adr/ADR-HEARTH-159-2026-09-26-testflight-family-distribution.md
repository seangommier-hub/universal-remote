# ADR-HEARTH-159: Household moves to TestFlight internal testing

**Date:** 2026-09-26
**Status:** Accepted, config and ASC group done; first family build BLOCKED (see Consequences)
**Supersedes:** the "we do not use TestFlight" conclusion of ADR-HEARTH-107 (also builds on ADR-HEARTH-083)

## Question (ADR-GLOBAL-002)

Adding a family member to ad hoc distribution needs a UDID registration, a rebuild, and USB/Safari trust steps. Should the household move to TestFlight?

## Answer

Sean approved on 2026-09-26: yes, use TestFlight internal testing.

## Decision

- Bundle id `com.seangommier.hearthapp` (ASC app 6813730400), EAS-managed remote credentials (ADR-HEARTH-106).
- New `eas.json` profile `family`: extends production, `APP_VARIANT=production`, `EXPO_PUBLIC_PERSONAL_HARDWARE_ENABLED=true` (production sets it false, which hides the Feeder tab), channel `family`, autoIncrement, `environment: preview`. Matching submit profile `family`.
- `app.config.js` unchanged: verified with `npx expo config --json` that `APP_VARIANT=production` gives `com.seangommier.hearthapp` and unset gives `com.hearthremote.app`, both version 1.2.0 with runtimeVersion policy appVersion, so the family build gets the same OTA JS as the ad hoc 1.2.0 build. `ITSAppUsesNonExemptEncryption: false` is already set (no export-compliance prompt).
- OTA parity: `EXPO_PUBLIC_*` is inlined at bundle time. `eas update --environment` selects server-side EAS variables (none are defined for `preview`), not eas.json profile env. `scripts/ship-update.sh` therefore exports the flag explicitly, always uses explicit `--branch` (never `--auto`, ADR-HEARTH-107) and `--environment preview`, publishes `preview` at runtimes 1.1.0 and 1.2.0, then `family`, and restores `app.config.js`.
- ASC: internal beta group "Family" (automatic distribution, hasAccessToAllBuilds), Sean added as tester, beta app info filled (`scripts/ios-credentials/setupFamilyTestFlight.js`, idempotent).
- Adding a person: `scripts/ios-credentials/inviteFamilyMember.js` (team invitation with the MARKETING role limited to Hearth, then group add after acceptance). Not run for Leah; it emails a third party and needs her Apple ID.
- Ad hoc phones migrate per `docs/TESTFLIGHT_MIGRATION.md`; the `preview` profile and its credentials are untouched.

## Risks

- TestFlight builds expire after 90 days. Plan: rebuild and resubmit the family profile by day 75 (calendar reminder), or sooner with any native change.
- `EXPO_PUBLIC_*` parity: any OTA must go through `ship-update.sh`, otherwise the flag can flip.
- The bundle id contains Sean's name (ADR-083 already accepted this).
- Internal testers must be App Store Connect users (MARKETING role, limited to Hearth). Beta App Review applies only to external testing, which is not used.
- Old builds 1 to 3 in ASC are visible to the group; harmless.

## Consequences

The first family build failed to start on 2026-09-26: the EAS Free plan has used its monthly iOS builds and resets on 2026-10-01 (upgrading is a paid purchase needing Sean). Credentials validated fine and the `family` channel/branch was created. Re-run `npx eas build -p ios --profile family --auto-submit --non-interactive` after the reset.
