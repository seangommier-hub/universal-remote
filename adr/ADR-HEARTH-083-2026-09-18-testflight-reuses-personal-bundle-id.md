# ADR-HEARTH-083: TestFlight/production channel reuses the existing `com.seangommier.hearthapp` bundle ID, dynamic config splits it from the ad-hoc channel

**Date:** 2026-09-18
**Status:** Accepted, implemented

## Context

Sean asked for TestFlight so future builds push to him as ordinary app updates instead of repeating
the manual ad-hoc install-link dance (ADR-HEARTH-082). Creating an App Store Connect app record
turned out to be impossible via the API at all — `POST /v1/apps` is unsupported
("Allowed operations are: GET_COLLECTION, GET_INSTANCE, UPDATE"), a permanent platform limitation,
not a role/permission issue. Querying existing app records found exactly one already on the
account: "Hearth Remote Home Control", tied to `com.seangommier.hearthapp` — left over from
earlier local AltServer sideloading work, months before ADR-HEARTH-080's decision that no
public-facing identifier should contain Sean's name.

## Question asked (ADR-GLOBAL-002)

Flagged the direct conflict before acting: using this existing record means Sean's name ends up in
the bundle identifier used for the production/TestFlight channel, contradicting ADR-HEARTH-080.
Offered the alternative (one more manual App Store Connect web step — the only way to create a
*new*, name-free app record, since the API can't do it) versus reusing what already exists.

## Answer

Sean: "no fix the one that already exists" — confirmed explicitly after the conflict was named,
choosing to reuse `com.seangommier.hearthapp` for speed rather than do the extra manual step.

## Decision

Converted `app.json` to a dynamic `app.config.js`. Bundle identifier now branches on
`process.env.APP_VARIANT`:
- unset (development/preview profiles) → `com.hearthremote.app`, no personal name, per
  ADR-HEARTH-080 — unchanged for the ad-hoc install flow already working.
- `"production"` (set via `eas.json`'s `build.production.env.APP_VARIANT`) →
  `com.seangommier.hearthapp`, reusing the pre-existing App Store Connect app record.

## Rationale

ADR-HEARTH-080's "no personal name" preference was about what's realistically public-facing;
Sean weighed that against the concrete cost (another manual multi-field web form) for a channel
(TestFlight, internal-only, never public App Store release) and chose speed. This is scoped
narrowly to the production/TestFlight identifier only — the ad-hoc/preview identifier Sean also
uses for direct device installs keeps the no-personal-name choice untouched.

## Consequences

- Two live bundle identifiers for the same app going forward: `com.hearthremote.app` (dev/preview,
  ad-hoc distribution, `credentialsSource: local`, already working) and `com.seangommier.hearthapp`
  (production, TestFlight, still on EAS-managed remote credentials since building a second local
  App-Store-type certificate/profile pipeline wasn't worth it for a channel used this
  infrequently — see the next ADR entry once that first production build's credential setup is
  actually run).
- `app.json` no longer exists; any tooling or documentation referencing it needs `app.config.js`
  instead. Verified both variants resolve correctly via `npx expo config --json` before relying on
  this for a real build.
- If Sean later decides the old `com.seangommier.hearthapp` App Store Connect record should be
  abandoned in favor of a clean, name-free one, that's a new decision, not a silent reversal of this
  one.

## Addendum: `cli.appVersionSource` changed to `remote`

The first real production build attempt failed outright: `autoIncrement option is not supported
when using app.config.js` — confirmed in `eas-cli`'s own source
(`ensureStaticConfigExists`/`updateAppJsonConfigAsync`) that `autoIncrement` with
`appVersionSource: "local"` requires physically rewriting a static `app.json`, which no longer
exists. Fixed by switching `eas.json`'s top-level `cli.appVersionSource` from `"local"` to
`"remote"` — the documented supported combination, where EAS tracks/increments each bundle
identifier's build number on its own servers instead of local config. No separate initialization
step needed; it self-initializes from the current local version on first build per identifier.
This is a mechanical consequence of the `app.config.js` conversion above, not an independent
judgment call, so it's recorded here rather than as its own ADR.
