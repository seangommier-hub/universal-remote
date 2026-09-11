# ADR-HEARTH-042: SmartThings, not Alexa, for smart outlets — and what's still needed from Sean

Date: 2026-09-11

## Status

Accepted for the direction; driver foundation built. Blocked on Sean
registering a SmartThings developer app before the pairing screen can be
finished — see Consequences.

## Context

Sean: "start thinking about and wiring up amazon alexa for the smart
outlets, this should be something that is sso and easy for the user.
along with any other thing we add. the user should be able to add
anything they want with a few clicks from their phone. not me asking you
to code it."

This project already has authoritative research on exactly this question
(`docs/DEVICE_FEASIBILITY.md`, written before this session, sourced
directly from each platform's own developer docs):

- **Amazon Alexa (Smart Home Skill API / Alexa Voice Service)** — direction
  mismatch. Both of Amazon's public APIs solve "let Alexa control *my*
  device" (for a manufacturer publishing a skill), not "let a third-party
  app control devices a user has already connected to their own Alexa
  account." There is no general-purpose public Amazon API for the latter.
  The doc's own conclusion: "Do not build against Alexa directly for this
  purpose." This isn't a matter of effort or a missing integration on
  Hearth's side — the platform doesn't expose the capability at all.
- **SmartThings (Samsung, cloud API)** — rated High priority in that same
  doc: official OAuth2 REST API, fully Expo-Go-compatible, "one of the
  easiest smart-home platforms to integrate," and it already aggregates a
  broad range of third-party device brands (including outlets/plugs)
  behind one consistent API. A user adds a device once in the SmartThings
  app — which already has exactly the "add anything with a few clicks"
  experience Sean described — and Hearth reads whatever's already there
  through their SmartThings login. This is the one that actually delivers
  "SSO and easy," not Alexa specifically.

## Decision

Build against SmartThings' Cloud API for smart outlets, not Alexa. This
also serves the broader ask ("along with any other thing we add") as a
real pattern: SmartThings is an *aggregator* — it already integrates with
outlets, switches, sensors, and more from many manufacturers, so once
Hearth speaks to SmartThings, any device brand a user has *already* added
there becomes reachable through the same one integration, without Hearth
writing a bespoke driver per outlet brand the way LG/Samsung/Sony/Roku/Hue
each needed their own.

**Built this session** (all local-testable, no live SmartThings account
needed yet):
- `src/core/types/Device.ts` — new `"outlet"` `DeviceCategory`.
- `src/discovery/smartThingsConfig.ts` — OAuth token storage
  (accessToken/refreshToken/expiresAt), entirely in SecureStore since
  every field here is a credential (unlike Family Command Center's
  baseUrl+token split, where the URL isn't sensitive).
- `src/drivers/outlet/smartthings/SmartThingsClient.ts` — REST wrapper
  against SmartThings' documented API: `GET /devices?capability=switch`
  (list outlets), `GET .../capabilities/switch/status` (read),
  `POST .../commands` (set).
- `src/drivers/outlet/smartthings/SmartThingsOutletDriver.ts` —
  `DeviceDriver` implementation, `power` capability only (an outlet is
  just an on/off switch). Proactively refreshes the access token 5
  minutes before expiry rather than reacting to a 401 mid-command.

**Deliberately not built yet**: the actual OAuth pairing screen and the
token-refresh implementation. Both depend on one fact only Sean can
supply — see Consequences.

## Rationale for the injected refresh function

`SmartThingsOutletDriver` takes `refreshAccessToken` as a constructor
argument (a function, not a hardcoded call to SmartThings' token
endpoint) because the *safe* way to do an OAuth token exchange depends on
which client type gets registered in the SmartThings Developer Workspace:

- **Public client + PKCE** (no client secret) — the modern, standard
  pattern for mobile apps (`expo-auth-session` has full built-in PKCE
  support). If SmartThings' registered app supports this, the whole
  flow — authorization *and* token refresh — can happen directly from
  the phone to SmartThings, no backend involved at all.
- **Confidential client** (client secret required) — a real, distributed
  mobile app binary is not a safe place to embed that secret (this
  project's own global coding standards: "Never commit secrets,
  credentials, API keys, tokens"). If this is what SmartThings requires,
  the token exchange has to be proxied through a small new endpoint on
  the Family Command Center — the exact same "backend does what the phone
  architecturally can't do safely" pattern already established for the
  HTTP/WS relay (ADR-HEARTH-011).

Deciding this now, before Sean has registered anything, would be
guessing. The driver and client are already fully correct and tested
either way; only the one `refreshAccessToken` implementation (and the
pairing screen that kicks off authorization) depends on the answer.

## Consequences

- 207/207 tests passing (17 new), `tsc --noEmit` clean.
- **What Sean needs to do next**: register an app at the [SmartThings
  Developer Workspace](https://developer.smartthings.com) (a free Samsung
  developer account). When creating the OAuth-integrated app, note which
  client type it registers as (public/PKCE vs. confidential/secret) —
  that single fact is what determines whether the pairing screen finishes
  as pure client-side code or needs a small Family Command Center
  addition. Not something this session can complete unilaterally, the
  same way Apple Developer Program approval or a Cloudflare account
  couldn't be substituted for.
- No pairing UI yet — "+ Add SmartThings" isn't wired into
  `DeviceListScreen`'s add menu or `bootstrap.ts`'s driver registry yet,
  since there's nothing to pair against until the above is resolved.
- Once resolved, the remaining work is comparatively small: an OAuth
  screen using `expo-auth-session`'s `useAuthRequest` (or a
  FCC-proxied token exchange), an outlet picker (mirroring
  `AddHueDeviceScreen.tsx`'s bridge-then-light-picker shape), and
  registering the driver in `bootstrap.ts`.

## Update 2026-09-11 (same day, later): the open question is answered — confidential client

Sean registered the "Hearth" Automation SmartApp in the SmartThings
Developer Workspace. Its Target URL PING check passed against a new
webhook built specifically for this in the Family Command Center codebase
(`family-command-center/adr/0157-smartthings-smartapp-webhook.md`), reached
through a new, path-scoped Cloudflare Tunnel running on the Pi itself
(`fcc-webhook.carddna.app`, scoped to exactly that one route — nothing
else on that household dashboard is internet-reachable).

On save, SmartThings issued **both a Client ID and a Client Secret** —
this is a confidential client, not public/PKCE. That settles this ADR's
open question: `SmartThingsOutletDriver`'s injected `refreshAccessToken`
must be implemented as a call to a small token-exchange endpoint on the
Family Command Center, never a direct-from-phone PKCE exchange — a real
client secret cannot safely live in a distributed mobile app binary.

The Client ID/Secret were captured once (SmartThings shows the secret
exactly one time) and stored directly in the Family Command Center's own
`.env.local` (`SMARTTHINGS_CLIENT_ID`/`SMARTTHINGS_CLIENT_SECRET`) —
never entered into Hearth's own codebase, never committed to git, matching
the same app-level-secret convention adr/0157 already established for
that project (the same category as `HEARTH_API_TOKEN`, not the
per-household connector vault). The service was restarted to pick up the
new variables; the webhook was re-verified live afterward (still `200`,
challenge still echoed correctly).

**Still open, now the only remaining piece**: the actual token-exchange
endpoint on the Family Command Center (e.g.
`POST /api/integrations/hearth/smartthings/token`, proxying to
SmartThings' own OAuth token endpoint with the client secret attached
server-side) doesn't exist yet — only the webhook lifecycle route does.
Building it is comparatively small scoped work now that every upstream
unknown (client type, credential storage location, app registration
itself) is resolved.
