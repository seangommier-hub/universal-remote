# ADR-HEARTH-190: Home Assistant OAuth sign-in (Track A step 7)

**Date:** 2026-09-27
**Status:** Accepted. Implements Track A step 7 of ADR-HEARTH-174 ("OAuth sign-in (needs a hosted
client_id page and a domain)"). Extends ADR-HEARTH-166 (REST driver) and ADR-HEARTH-175 (shared
per-instance client, WebSocket session). Pi-side companion: adr/0219 (family-command-center repo).
**Verification:** Unit tests with mocked `fetch`, mocked `expo-web-browser`, and Jest fake timers.
No real Home Assistant instance was contacted (see "Unverified", matching ADR-166/175's own
precedent). `npx tsc --noEmit`: clean. `npx jest`: full existing suite plus 36 new tests all pass;
the one pre-existing failure (`runner/shims/shims.test.ts`, unrelated `WebSocketServer` mock issue)
is the same one already called out as ignorable in ADR-HEARTH-181.

## Context

Every Home Assistant device today needs a pasted long-lived access token (LLAT, ADR-HEARTH-166/175).
That is the simplest path and stays exactly as it is — this ADR adds OAuth sign-in as a second,
equally valid way to connect an instance, for instances or households that prefer it. Neither path
is ever removed or forced.

## Domain check (done first, per instruction)

Before writing any OAuth code, confirmed the Pi's public domain is real and stable, not the
ephemeral quick-tunnel this memory note used to describe:
- `nslookup hearth-relay.carddna.app` resolved to real Cloudflare anycast IPs.
- `curl https://carddna.app` → 200; `curl https://hearth-relay.carddna.app/api/integrations/hearth/connection-info` → 401 (reachable, auth-gated, not a DNS/tunnel failure).
- SSH into the Pi: `cloudflared-smartthings-webhook.service` is `active`, and its config
  (`/home/seangommier/.cloudflared/smartthings-webhook-config.yml`) is the **named** tunnel
  (`tunnel: 079b2e59-...`) set up 2026-09-21 (ADR-HEARTH-123/125, Pi adr/0182/0192) with real
  `hearth-relay.carddna.app` / `hearth-ws.carddna.app` / `hearth-vnc.carddna.app` ingress rules — not
  the ephemeral `trycloudflare.com` tunnel the domain check was specifically warned might still be
  live. **Result: the domain is real and stable. Proceeded to build OAuth.**

## Decisions

### 1. Client_id page and redirect (Pi adr/0219)
Home Assistant's auth API (developers.home-assistant.io/docs/auth_api, fetched 2026-09-27) treats
`client_id` as a website and normally requires `redirect_uri` to share its host/port. A native app's
custom scheme (`hearth://ha-auth`) is not a website, so the client_id page instead declares
`<link rel="redirect_uri" href="hearth://ha-auth">`, which HA's own docs describe as the supported
way to do this. The Pi's family-command-center Next.js app now serves that page at
`https://hearth-relay.carddna.app/hearth/ha-client` (`haOAuthConfig.ts`'s `HA_OAUTH_CLIENT_ID_URL`).
Deploying that Pi-side page was **deferred this session** (adr/0219) because a concurrent session
had just committed to the same repo — sign-in against a real Home Assistant instance is therefore
unverified until that page actually goes live; nothing else in this ADR depends on it being live to
be reviewed or tested.

### 2. No PKCE, no client secret
A generic `expo-auth-session` `AuthRequest`/`exchangeCodeAsync` defaults to PKCE and assumes a
`client_secret`-shaped token exchange. Home Assistant's own auth API documents neither. Rather than
guess whether an undocumented server would silently accept or reject extra PKCE parameters, the
authorize URL and the `/auth/token` POST are both built by hand in `haOAuthProtocol.ts`, matching
exactly the documented fields (`response_type`, `client_id`, `redirect_uri`, `state` for authorize;
`grant_type`/`code`/`client_id` or `grant_type`/`refresh_token`/`client_id` for the token endpoint).
This is more spec-literal and more testable without a live server, at the cost of not reusing
`expo-auth-session`'s built-in request/exchange machinery — `expo-web-browser`'s
`openAuthSessionAsync` is still used for the actual browser round trip. **Unverified**: whether HA
tolerates unexpected extra parameters is not tested here either way, since none are sent.

### 3. Redirect capture: openAuthSessionAsync, not a global Linking listener
`usePairLinkListener.ts`'s `hearth://pair` handling uses a global `Linking.addEventListener`. This
flow instead relies on `expo-web-browser`'s own redirect capture (`openAuthSessionAsync`'s resolved
`result.url`), per Expo's own v57 docs: iOS uses `ASWebAuthenticationSession` and explicitly does not
need (and can have side effects from) a `Linking` listener; Android's Chrome-custom-tabs path
manages its own `AppState`/`Linking` handling internally. A second, app-wide listener could race the
auth session's own capture. The URL-parsing convention is still kept consistent with the rest of the
app (`parseHaAuthRedirect`, a prefix-checked parser like `pairInviteFromUrl`).

### 4. State storage: alongside HaInstance, not inside it
`HaInstance.token` (ADR-HEARTH-175) is reused unchanged as "whatever bearer token the REST client and
WebSocket session should use right now" — for OAuth that is the current, proactively-refreshed access
token, kept fresh by calling the existing `registerHaInstance(baseUrl, newAccessToken)`, which already
notifies `haInstanceHub.ts`'s listener and reconnects the live WebSocket with the new token. OAuth's
extra bookkeeping (refresh token, issued/expiry timestamps, needs-sign-in flag) lives in a parallel,
single-purpose module pair — `haOAuthState.ts`/`haOAuthStateRegistry.ts`/`haOAuthStateStore.ts` — kept
entirely separate from `haInstance.ts`/`haInstanceRegistry.ts`/`haInstanceStore.ts` (ADR-GLOBAL-003).
This means an LLAT-only instance simply has no OAuth state at all, with zero shape changes to the
existing type or its many call sites. Persistence mirrors `haInstanceStore.ts` exactly: the refresh
token in SecureStore, everything else (instance id, issued/expiry timestamps, needs-sign-in) in
AsyncStorage.

### 5. Proactive refresh at 80% of lifetime, with jittered retry on transient failure
Home Assistant's access tokens last 1800s (30 min, per the fetched docs). `msUntilProactiveRefresh`
computes the refresh time as 80% of the token's own `issuedAt..expiresAt` span, so the same function
gives the right answer both right after sign-in and after the app was restarted and rehydrated hours
later (`haOAuthRefreshScheduler.ts` re-arms every hydrated OAuth instance's timer at startup,
`App.tsx`). A refresh that fails for a reason other than `invalid_grant` (a network blip, a timeout)
retries with the same jittered exponential backoff pattern every other driver's reconnect logic uses
(`withBackoffJitter`, 2s doubling to 30s) rather than giving up. Only `invalid_grant` — the refresh
token itself permanently rejected — marks the instance `needsSignIn` and stops scheduling.

### 6. Re-auth: a banner and button in AddHomeAssistantScreen, not HomeAssistantSyncScreen
The task listed both `AddHomeAssistantScreen.tsx` and `HomeAssistantSyncScreen.tsx` as places to add
a "Sign in with Home Assistant" button. `HomeAssistantSyncScreen` (checked: `src/ui/HomeAssistantSyncScreen.tsx`)
takes only already-resolved import candidates — it has no address or credential field at all, so there is
nothing to add a sign-in button next to there; it is reached only after `AddHomeAssistantScreen` has
already produced a working token. The button (and, when `getHaOAuthState(instance.id)?.needsSignIn`
is true, an inline "Your Home Assistant sign-in expired" banner) were added only to
`AddHomeAssistantScreen`, which is the screen that actually owns the address/token entry for both a
first sign-in and a re-sign-in. Verified in the web harness (`?demo=1&screen=add:homeassistant`):
button disabled with no address, enabled once one is typed; banner renders correctly when
`needsSignIn` is forced true (screenshot-verified, then reverted — see "Unverified" for what this
does and does not prove).

### 7. What is intentionally not changed
`HaSession`'s existing `auth-failed` path (a live WebSocket's token rejected by HA mid-session) still
shows `HA_TOKEN_REJECTED_MESSAGE`, worded for a pasted LLAT ("Create a new long-lived access token...").
An OAuth instance whose access token is rejected mid-session by HA (distinct from the refresh token
being rejected, which this ADR's scheduler already handles) would see that same LLAT-worded message.
Flagged as a follow-up, not fixed here — out of this ADR's scope and lower priority, since a
proactively-refreshed access token being rejected while still supposedly valid should be rare.

## Questions and answers (ADR-GLOBAL-002)
- *Manual protocol implementation vs. expo-auth-session's AuthRequest?* Manual (see Decision 2) —
  not a business-ambiguity question, a technical one with the fetched HA docs as the tie-breaker;
  logged here rather than interrupting, consistent with ADR-175's own precedent for this kind of
  decision.
- *openAuthSessionAsync vs. a global Linking listener?* openAuthSessionAsync (see Decision 3), same
  reasoning: Expo's own docs settle it.
- *Deploy the Pi-side page this session?* No — a concurrent session's commit landed 5 minutes before
  the pre-deploy check; deferred per the standing instruction to wait rather than risk a collision
  (Pi adr/0219 has the full account).

## Unverified
- **No real Home Assistant instance was contacted.** `/auth/authorize`, `/auth/token` request/response
  shapes follow the fetched docs page only.
- **The Pi's client_id page is not live yet** (adr/0219) — the authorize URL it builds is correct by
  construction, but nothing has confirmed Home Assistant actually reads the `<link rel="redirect_uri">`
  tag from it end-to-end.
- The web-harness screenshots confirm the button's enabled/disabled state and the banner's rendering
  and copy; they do not exercise the real browser round trip (`WebBrowser.openAuthSessionAsync`),
  which does not run meaningfully on web/demo — per instruction, this was mocked at the unit-test
  level instead (`haOAuthSignIn.test.ts`).
- Whether Home Assistant's `/auth/token` endpoint tolerates or rejects unexpected extra parameters
  (had a generic PKCE-sending client been used instead) is untested either way.
- iOS/Android `ASWebAuthenticationSession`/Chrome-custom-tabs behavior for this specific flow was not
  tested on a device.

## Consequences
- New files, all under `src/drivers/homeAssistant/`: `haOAuthConfig.ts`, `haOAuthProtocol.ts` (+test),
  `haOAuthState.ts` (+test), `haOAuthStateRegistry.ts`, `haOAuthStateStore.ts` (+test),
  `haOAuthSignIn.ts` (+test), `haOAuthRefreshScheduler.ts` (+test).
- `App.tsx`: hydrates OAuth state and re-arms each instance's refresh timer at startup, alongside the
  existing `hydrateHaInstances()` call.
- `src/ui/AddHomeAssistantScreen.tsx`: a "Sign in with Home Assistant" button and a needs-sign-in
  banner, alongside the existing address/token fields.
- No changes to `haInstance.ts`, `haInstanceRegistry.ts`, `haInstanceStore.ts`, `HomeAssistantDriver.ts`,
  `haSession.ts`, or any existing device/import flow — the LLAT path is untouched.
- Follow-ups: the mid-session `auth-failed` message wording for an OAuth instance (Decision 7);
  deploying the Pi-side client_id page and doing a real end-to-end sign-in against a live Home
  Assistant instance.
