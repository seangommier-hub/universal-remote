# ADR-HEARTH-192: Amazon Smart Plugs via the Family Command Center's Alexa bridge

Date: 2026-09-27

## Status

Accepted and built. Supersedes **only the Amazon Smart Plug row** of
ADR-HEARTH-048's "do not build" research — that ADR's Fire TV, Echo/Alexa
(device control), and Ring rows are untouched and still stand exactly as
written. This ADR does not reopen any of those three; it narrowly revisits
Amazon Smart Plug now that a real, working Pi-side bridge exists.

## Context

ADR-HEARTH-048 (2026-09-12) researched all four Amazon-ecosystem device
types Sean asked about and found Amazon Smart Plug specifically
"not buildable at all" for a third-party remote-control app: "Amazon has
not published a local control API or protocol for its own Smart Plug
line... the only control surface is the Alexa app/cloud itself... There is
no path to control an Amazon Smart Plug that doesn't require the exact
'control a user's already-connected Alexa device' capability Amazon does
not expose to third parties."

That verdict was about Amazon's own *public, sanctioned* developer surface,
and it is still correct — nothing changed there. What changed is that a
sibling Claude session built a real bridge on the Family Command Center
(Pi) side, `family-command-center` commit `bd0b0b9` /
`family-command-center/adr/0222`, using `alexa-remote2` — an unofficial
library that logs in as a real Alexa account (the same category of
approach ADR-HEARTH-048 named and declined to build against directly for
Echo/Alexa device control in general, and the same risk class Ring's own
unofficial `ring-client-api` represents there). Sean was told this
tradeoff directly by the sibling session and accepted it specifically for
this feature: an unofficial, reverse-engineered path to real device
control, in exchange for getting Amazon Smart Plug control at all, given
Amazon exposes no sanctioned equivalent. This is the same trade-off class
this codebase already accepted once for a different brand — SwitchBot's
`SwitchBotVacuumDriver.ts` already depends on SwitchBot's own cloud API
rather than a local protocol (ADR-HEARTH-118), so a household losing
internet already means losing control of that vacuum; accepting a cloud
(and here, additionally unofficial-API) dependency for a smart-home
integration is not a new category of risk for this project, just a new
instance of one already live in it.

**What this session independently verified**: the HTTP contract below,
by testing Hearth's own client/driver/UI against it with mocks and the
demo harness. **What this session did not independently verify**: the
sibling session's own `family-command-center/adr/0222` content or its
exact `alexa-remote2` implementation details — this repo's local checkout
of `family-command-center` (and every worktree found on this machine) is
behind that commit and does not contain it, and no SSH/remote access to
the Pi was attempted for this ADR. The reasoning above (unofficial API,
risk accepted by Sean, SwitchBot-class trade-off) is relayed from the
task briefing this session was given, not independently confirmed against
the sibling's own ADR text. If that text turns out to say something
different, this ADR's "Context" section is the part to correct, not the
contract or code below, which were verified directly.

## The contract (verified against directly, via mocks)

```
GET  /api/integrations/hearth/alexa/plugs
     -> {"plugs":[{id, name, manufacturer, on: boolean|null, reachable: boolean}]}
POST /api/integrations/hearth/alexa/plugs/<id>  body {"state":"on"|"off"}
     -> {"success":true}
```

Auth: the household's existing Hearth bearer token, via `fccFetch` — no
separate Amazon credential is ever held on the phone, the exact same shape
as `SmartThingsClient.ts`. Errors: 401 unauthorized, 400 bad id/state, and
502 with a real `{"error": "..."}` message body for "Amazon isn't signed in
yet" or "the bridge is down" — two distinct, actionable problems, not a
generic unreachable-device case.

These routes live at `/api/integrations/hearth/alexa/` — unlike the newer
camera routes noted in the briefing, this path **does** work through the
existing public tunnel the same way SmartThings' routes already do, so no
new tunnel/routing work was needed on Hearth's side.

## Decision

Build `AlexaPlugDriver` mirroring `SmartThingsOutletDriver.ts`'s shape
exactly: an `outlet`-category driver, `power` capability only, every
Amazon interaction (sign-in, token storage, the unofficial API calls
themselves) staying entirely on the Family Command Center side, reached
only through a thin proxy client (`AlexaPlugClient.ts`). `usesFcc: true`
in the driver contract adapter, matching Chromecast/AppleTv/Vizio/etc.

**Built this session:**

- `src/drivers/outlet/alexa/AlexaPlugClient.ts` — REST wrapper: `listPlugs()`,
  `setPlugState()`, `AlexaBridgeError` (carries the real HTTP status),
  `isAlexaNotLinkedError()` (true for the 502 "not linked" case),
  `FamilyCommandCenterNotConfiguredError`. Reads the route's own
  `{"error": "..."}` body on a non-ok response so the *real* 502 message —
  whichever of the two distinct cases it is — reaches the user verbatim,
  never collapsed into a generic "Family Command Center returned 502".
- `src/drivers/outlet/alexa/AlexaPlugDriver.ts` — `power`-only
  `DeviceDriver`. `plug.on === null` leaves `values.power` unset rather
  than fabricating `"off"` — the same convention `XboxDriver` already
  established for a capability this driver can't query (see
  `UniversalTvRemote.tsx`'s own `power === "on" || power === "off" ? power
  : undefined` read of it), reused here rather than inventing a third
  power-state string the rest of the app was never built to render.
  `plug.reachable === false` is treated as a real, expected "device
  offline" case — mark disconnected, schedule the standard backoff retry
  — exactly like a plug missing from the Center's list, not a driver bug.
- `src/drivers/outlet/alexa/describeAlexaBridgeFailure.ts` — the one place
  a 502's message is decided: `isAlexaNotLinkedError` bypasses the generic
  `describePairingFailure` network-failure classifier entirely (which
  could otherwise reclassify an actionable "Amazon isn't signed in" string
  as a generic "can't reach the device" LAN problem) and surfaces Family
  Command Center's own message as-is.
- `src/ui/AddAlexaPlugsScreen.tsx` — "Sync from Alexa", list-then-pick,
  same shape as `AddSmartThingsOutletsScreen.tsx` (no per-device pairing
  UI in Hearth; the real setup step is the one-time Amazon sign-in on
  Family Command Center, covered by `ALEXA_SETUP_GUIDE` in
  `deviceSetupSteps.ts`). Unlike SmartThings' plain label list, each row
  also shows the plug's live state (On / Off / Unreachable / Status
  unknown) before the user commits to adding it, since `reachable` and
  nullable `on` are real signals worth surfacing up front here.
- Wiring: `alexa` `BrandId` entry in `brandRegistry.ts` (`needsFcc: false`
  — same reasoning as Kasa/Govee/SmartThings there: gates the add flow,
  not command execution), `renderAddScreen.tsx` case, `bootstrap.ts`
  registration, a `driverContract.test.ts` adapter entry (no exemptions —
  this driver follows the standard connection contract exactly), and demo
  fixtures (`demoAlexaPlugs.ts` + a `demoFetch.ts` route) so "Sync from
  Alexa" is screenshot-verifiable without a real Amazon-linked plug.

## Consequences

- OTA-able: **yes, confirmed**. No native module or new Expo config
  plugin was added — this is plain `fetch` through the existing
  `fccFetch`/`fccRequest` HTTP path, identical in kind to every other
  FCC-proxied driver already in this app (SmartThings, Kasa's command
  path, Chromecast, etc.). Ships the same way any other JS/TS change to
  this app does.
- 22 new test cases across `AlexaPlugClient.test.ts`, `AlexaPlugDriver.test.ts`
  and `describeAlexaBridgeFailure.test.ts`, plus one new
  `driverContract.test.ts` adapter entry (no exemptions, so it runs every
  shared connection-contract assertion). Full suite (2,111 tests, 177
  suites) green apart from the pre-existing, unrelated
  `runner/shims/shims.test.ts` `WebSocketServer` failure this session did
  not touch. `npx tsc --noEmit` clean.
- Nothing here is verified against a real, Amazon-linked plug — every test
  and the web-harness screenshot are against the documented HTTP contract
  and mocks/fixtures. Sean is doing the real one-time Amazon sign-in on
  the Pi separately; once a real plug is linked, "Sync from Alexa" should
  be tried against it live as the actual end-to-end check this session
  could not perform.
- If the sibling session's own `family-command-center/adr/0222` (once
  reachable from this checkout) describes the bridge, its error messages,
  or its contract differently from what's written above, that ADR is the
  source of truth for the Pi side and this one should be corrected to
  match it, not the other way around.

## Correction (2026-09-27)

The Pi-side Amazon bridge ADR was renumbered from `adr/0218` to `adr/0222` by the session that wrote it, after a same-day number collision with `0218-hearth-per-phone-roles-phase-2`. References above now point at `0222`. Live data confirmed the contract: 4 plugs, opaque applianceId ids (URL-encoded by the client), `on` may be null.
