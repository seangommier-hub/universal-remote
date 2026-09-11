# ADR-HEARTH-042: SmartThings, not Alexa, for smart outlets — and what's still needed from Sean

Date: 2026-09-11

## Status

Accepted for the direction (SmartThings, not Alexa). The pairing
*mechanism* described below has been superseded — see the 2026-09-11
"course correction" update near the bottom: a WEBHOOK_SMART_APP does not
use a browser OAuth flow, so the driver/token-storage shape this ADR
originally specced needs to be rebuilt against the SmartThings mobile
app + FCC-context-store model instead. Read that update before touching
`SmartThingsOutletDriver.ts` or `smartThingsConfig.ts`.

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

## Update 2026-09-11 (same day, later still): token-exchange endpoint built and live

`POST /api/integrations/hearth/smartthings/token` now exists
(`family-command-center/adr/0157`'s later update), gated by the same
`HEARTH_API_TOKEN` bearer every other Hearth-authenticated FCC route
uses, accepting `{grantType: "authorization_code", code, redirectUri}`
or `{grantType: "refresh_token", refreshToken}` and returning
`{accessToken, refreshToken, expiresIn}` — the exact shape
`SmartThingsOutletDriver.ts`'s own `RefreshedTokens` interface already
expects, so wiring `refreshAccessToken` to call it needs no reshaping.

Real finding while building it: SmartThings' token endpoint requires
client credentials via HTTP Basic Auth, not form-body params (unlike
Google's, which this project's existing OAuth code uses as a template) —
caught live via a real request that failed with a bare `401`, fixed, and
re-verified end-to-end.

**What's actually left now**: Hearth's own OAuth pairing screen
(`expo-auth-session`, already installed) that opens SmartThings'
`/oauth/authorize` in-browser, receives the redirect with a code, and
calls the token-exchange endpoint above; an outlet picker; and
registering `SmartThingsOutletDriver` in `bootstrap.ts` /
`DeviceListScreen`'s add menu. No more unknowns — this is now
implementation work with everything it depends on already resolved and
verified live.

## Update 2026-09-11 (same day, later still): course correction — no OAuth browser flow for this app type, driver needs a rebuild

Everything above through the previous update was built on one wrong
assumption, discovered while investigating exactly *how* Hearth's pairing
screen should kick off authorization. Checked directly against the
`@smartthings/smartapp` SDK's own README and source
(`family-command-center/node_modules/@smartthings/smartapp/lib/smart-app.js`),
not secondhand:

**A WEBHOOK_SMART_APP (Automation type — what "Hearth" is registered as
in the Developer Workspace, confirmed by its "CPT-AUTOMATION" project
category) does not use a browser OAuth authorization-code flow at all.**
That flow is real, but it belongs to a different SmartThings app type
(`API_ONLY`), which this project isn't. Instead:

- The user installs "Hearth" through the **SmartThings mobile app**
  (Developer Mode, since it isn't published to the marketplace) — not a
  screen inside Hearth.
- SmartThings renders a config page *inside its own app* during
  install/reconfigure, letting the user pick which devices to expose. The
  Family Command Center's webhook now defines this page (`.page("mainPage", ...)`,
  requesting `switch`-capability devices, multi-select).
- On INSTALL/UPDATE, SmartThings hands the webhook an access/refresh
  token pair directly in the lifecycle event body — no separate code
  exchange. The SDK persists and auto-refreshes these through a
  `ContextStore`, which is mandatory (its README: "there is no in-memory
  context store; you must use a context store plugin").

Family Command Center's side is now corrected (see
`family-command-center/adr/0157`'s matching update): a Supabase-backed
`ContextStore` (migration `0077_smartthings_context.sql`), `clientId`/
`clientSecret` wired into the `SmartApp` instance, and the `mainPage`
device picker. **Not yet deployed** — the migration needs to run against
the real Supabase project first (blocked on Sean signing into the correct
Supabase account; the session's own Chrome/GitHub SSO session resolves to
a different, empty Supabase org than the one hosting this project's
database).

**What this means for Hearth's own code, none of which is built yet
beyond what ADR-HEARTH-042's earlier updates already shipped**:

- `smartThingsConfig.ts` (SecureStore-based OAuth token storage on the
  phone) is the wrong shape entirely — Hearth's phone should never hold a
  SmartThings access/refresh token, because there's no OAuth exchange for
  it to receive one from under this app type. This file should be
  deleted, not adapted.
- `SmartThingsOutletDriver.ts`'s `RefreshAccessToken` injection point
  (calling `/api/integrations/hearth/smartthings/token`) is solving a
  problem that doesn't exist for this app type. The driver needs to be
  rewritten to call a **new Family Command Center proxy endpoint**
  instead (e.g. `GET/POST /api/integrations/hearth/smartthings/outlets`,
  not yet built) that uses the FCC's own stored context internally —
  the same "backend does what the phone architecturally can't do safely"
  pattern already established for the relay (ADR-HEARTH-011), except here
  it's "shouldn't have to," not "can't": there's simply no token for the
  phone to hold.
- The already-built `/api/integrations/hearth/smartthings/token` endpoint
  on the Family Command Center is now dead code for this integration and
  should be removed once the new outlet-proxy endpoints exist.
- There is no "+ Add SmartThings" pairing screen to build inside Hearth
  at all. The pairing action is "open the SmartThings app and install
  Hearth" — which is real friction against the original ask ("a few
  clicks from their phone, not me asking you to code it"), and worth
  flagging to Sean directly rather than glossing over: this is simply how
  an unpublished WEBHOOK_SMART_APP works, not a design choice.

**Next implementation steps, in order**: (1) Sean applies migration 0077
via his own Supabase login; (2) rebuild the FCC's SmartThings build and
restart the service; (3) build the FCC outlet-list/control proxy
endpoints; (4) rewrite `SmartThingsOutletDriver`/delete
`smartThingsConfig.ts` on Hearth's side to call the proxy instead of
SmartThings directly; (5) Sean installs "Hearth" via the SmartThings app
(Developer Mode) and picks outlets through its config page; (6) Hearth's
`DeviceListScreen` gets a "Sync from SmartThings" action (list what the
FCC proxy already knows about) rather than a pairing/OAuth screen.

## Update 2026-09-11 (same day, later still): migration applied, fully live end-to-end

Sean applied `supabase/migrations/0077_smartthings_context.sql` himself
(the one piece that genuinely needed his own Supabase login — no
credential-free path existed, confirmed by actually checking, not
assumed). Family Command Center rebuilt and restarted; verified live:

- `smartthings_context` table exists.
- The webhook still answers PING correctly post-restart (no regression).
- `GET /api/integrations/hearth/smartthings/outlets` now returns a
  graceful `{"error":"SmartThings isn't installed yet -- install \"Hearth\"
  from the SmartThings app first."}` (502) instead of crashing — proves
  the full code path (route → outlets lib → context store → real
  Supabase table) works end-to-end.

**Every piece of this integration that could be built without Sean's own
hands is now built, deployed, and verified live.** What's left is
entirely real-hardware/Sean-only: install "Hearth" via the SmartThings
mobile app (Developer Mode), pick a real outlet there, then tap "Sync
from SmartThings" in Hearth and confirm it actually controls the device.
