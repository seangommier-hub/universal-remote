# ADR-HEARTH-111: Feeder tab hidden from any future public-app-store build

**Date:** 2026-09-20
**Status:** Accepted, implemented

## Context

Sean, directly: "squirrel feeder is only on my build not everyone elses if i upload this to the
various app stores" — a real, forward-looking product concern. The Feeder tab (ADR-HEARTH-104) is
real, working code, but it's tied to one specific piece of the household's own hardware (an ESP32
project of Sean's), not something a household member who might one day download Hearth from a
public app store should ever see.

## Decision

Reused the existing `APP_VARIANT` distinction (`app.config.js`, ADR-HEARTH-083) rather than
inventing a second flag — `"production"` is already the one build profile/bundle identifier meant
for eventual store distribution (`com.seangommier.hearthapp`, `distribution: "store"`), while
`development`/`preview` are Sean's own personal-install profiles. `eas.json`'s `production` build
profile now also sets `EXPO_PUBLIC_PERSONAL_HARDWARE_ENABLED=false`; `App.tsx` reads it via
`process.env.EXPO_PUBLIC_PERSONAL_HARDWARE_ENABLED !== "false"` (Expo's own convention: any
`EXPO_PUBLIC_*` var is inlined into the JS bundle at build time) and conditionally renders the
entire `Feeder` `Tab.Screen`. Every other build profile leaves the var unset, which defaults to
enabled — nothing needs to opt in for the common case, only the one profile meant for eventual
public distribution opts out.

## Consequences

- No behavior change for Sean's own personal (development/preview) builds — the Feeder tab
  continues to work exactly as it does today.
- A future `production` build (whether that ever actually reaches a public app store or stays as
  Sean's own TestFlight channel) never renders the Feeder tab, never shows the squirrel feeder in
  the device list, and has no UI path to add one — `SquirrelFeederDriver` stays registered in
  `bootstrap.ts` regardless (harmless with no UI ever exercising it, and simpler than also
  conditionally excluding driver registration for no behavior difference).
- `npx tsc --noEmit` and `npx jest --silent` (913/913) both clean — no existing test needed
  updating, since none of them set `APP_VARIANT`/exercise the production variant's App.tsx render
  path directly.
- Establishes the pattern for any future personal-hardware-only feature: reuse
  `EXPO_PUBLIC_PERSONAL_HARDWARE_ENABLED` (or the underlying `APP_VARIANT` check directly) rather
  than adding a new flag per feature.
