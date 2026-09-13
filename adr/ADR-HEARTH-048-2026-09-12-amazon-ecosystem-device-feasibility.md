# ADR-HEARTH-048: Amazon ecosystem device feasibility — Fire TV, Echo/Alexa, Ring, Amazon Smart Plug

Date: 2026-09-12

## Status

Research/scoping only. No driver or screen code written. This ADR exists
to settle, with sourced evidence, whether any of the four is worth
building before engineering time is committed — matching this project's
own established pattern (ADR-HEARTH-004/005/006/032: verify the real
protocol/API against current official docs before writing a driver).

## Context

Sean asked for Hearth to eventually control the whole Amazon ecosystem:
Fire TV, Echo/Alexa devices, Ring devices, and Amazon Smart Plug/other
Amazon-linked smart home devices — "all four," despite them being
technically unrelated to each other and to everything Hearth currently
supports (Sony/Samsung/LG/Roku/Hue over local LAN protocols, SmartThings
over a household-proxied cloud OAuth API — see `SmartThingsOutletDriver.ts`
and `AddSmartThingsOutletsScreen.tsx`).

This project already has one directly relevant piece of prior research:
`docs/DEVICE_FEASIBILITY.md` (2026-09-08) covers Fire TV and Amazon Alexa
already, and ADR-HEARTH-042 already acted on that research once ("Do not
build against Alexa directly for this purpose" — confirmed again below,
still true five weeks later). This ADR extends that work to Ring and
Amazon Smart Plug, which the existing doc never covered, and re-verifies
Fire TV/Alexa against today's docs rather than assuming the 2026-09-08
findings are still current without checking.

**Existing architecture reviewed before this research:**
- `src/core/drivers/DeviceDriver.ts` — the interface every driver
  implements (`connect`/`disconnect`/`getState`/`executeCommand`/
  `subscribeToState`), manufacturer-specific logic fully isolated behind
  it.
- `src/core/types/Capability.ts` — the universal capability model; new
  capabilities are added only once a real driver/protocol needs them, not
  speculatively.
- `src/drivers/streaming/roku/RokuEcpDriver.ts` — the simple case: plain
  local HTTP, no auth, works in Expo Go.
- `src/drivers/outlet/smartthings/SmartThingsOutletDriver.ts` +
  `SmartThingsClient.ts` + `src/ui/AddSmartThingsOutletsScreen.tsx` — the
  project's only precedent for a cloud-API-with-auth integration. Its
  actual shape, after ADR-HEARTH-042's course correction, is **not** a
  browser OAuth flow Hearth's phone drives — SmartThings is a
  WEBHOOK_SMART_APP, so pairing happens entirely inside the SmartThings
  mobile app (a config page SmartThings itself renders), tokens are
  delivered server-to-server to the Family Command Center's webhook, and
  Hearth's phone never holds a credential at all. `AddSmartThingsOutletsScreen`
  is purely a "list what the household already granted" picker, not a
  pairing UI.

That last point matters directly for this research: **Hearth does not
actually have a reusable "phone-driven OAuth" foundation today.** The one
cloud-integration precedent that exists turned out, on inspection, to be
a server-mediated webhook-install pattern, not a classic
authorization-code-in-a-WebView flow. Any Amazon integration needing real
user-delegated OAuth (Login with Amazon / Ring's account-linking) would
be new infrastructure for this codebase, not a reuse of existing code —
`expo-auth-session` is already an installed dependency (per ADR-HEARTH-042's
history) but nothing in this repo currently drives it end-to-end.

## Research findings, per device type

### 1. Amazon Fire TV

- **Real third-party local-network control API: no.** Amazon's own docs
  (`developer.amazon.com/docs/fire-tv/remote-input.html`, last updated
  2026-02-19, re-verified today) cover two things: the Fire TV
  Integration SDK (building apps that run *on* Fire TV, not remote
  control *of* it) and ADB (Android Debug Bridge) — a developer/debugging
  tool, not a consumer control surface. No IP/REST control API for
  end-user remote-control apps exists, confirmed unchanged from the
  2026-09-08 finding in `docs/DEVICE_FEASIBILITY.md`.
- **Auth/access reality:** ADB is local-network-only (no Amazon developer
  account or cloud auth needed at all) — but only after the *end user*
  manually enables Developer Options on their Fire TV (Settings → My Fire
  TV/Device & Software → About → click device name 7 times → Developer
  Options → USB/network debugging on) and then approves Hearth's ADB key
  fingerprint on an on-screen prompt the first time it connects.
- **New 2026 wrinkle found during this research, not present in the
  2026-09-08 doc:** Amazon's 2026 Fire TV Stick HD and the Fire TV Stick
  4K Select ship on a new "Vega OS," not Android — they cannot run
  Android APK files and use "a different developer workflow" per Amazon's
  own current docs. This means even the fragile ADB path may not exist at
  all on newer hardware going forward; it isn't just "old and unofficial"
  but actively shrinking as a target surface on new devices.
- **User setup burden:** Real and non-trivial — digging into a
  device-info screen, clicking it 7 times, enabling a debugging toggle
  most non-technical users have never heard of, per Fire TV device. This
  is the same category of friction ADR-HEARTH-043 already flagged as a
  dead end for a different unrelated feature (Pi sideloading via
  AltStore) — a manual, technical, "not something to ask a normal user to
  do" setup step.
- **Scope estimate:** Multi-session, not same-day. No JS/Expo-Go-callable
  primitive exists for ADB (raw TCP + Android's ADB handshake/auth
  protocol) — this needs a bespoke native module (no maintained
  React Native ADB client library found), a Dev Build, and it would still
  only work on Fire TV hardware old enough to run Android at all. Direction:
  **do not build.**

### 2. Amazon Echo / Alexa devices

- **Real third-party API to control a user's existing Echo/Alexa devices:
  no, confirmed still true today.** Checked Amazon's current official
  docs directly (not from memory): the Smart Home Skill API family — including
  the *new* 2026 "Alexa+" Smart Home add-on APIs
  (`developer.amazon.com/docs/alexaplus/device-apis/smart-home-general-apis.html`,
  `.../smarthome/build-smart-home-addons-for-entertainment-devices.html`,
  `.../device-apis/overview-smart-home-security.html`) — all still solve
  the same single direction: *"Implement smart home interfaces in your
  Alexa add-on to enable device control for users"* — i.e., a
  manufacturer building a skill so **Alexa can control their product**.
  None of it lets a third-party app like Hearth list or control devices a
  user has *already* connected to their own Alexa account. This is the
  exact direction-mismatch `docs/DEVICE_FEASIBILITY.md` already documented
  on 2026-09-08 and ADR-HEARTH-042 already acted on — still accurate as of
  today, re-verified against the current doc set rather than assumed.
- **The Google comparison point, checked directly:** Google shipped a
  genuine reverse-direction "Home APIs" product in 2024-2026 letting
  third-party apps control devices already in a user's Google Home graph
  (confirmed via Google's own developer blog and `developers.home.google.com/apis`).
  Amazon has announced no equivalent as of today's research — the 2026
  Alexa+ developer announcements (MCP support, an "AI-powered smart home
  developer toolkit," Amazon Wallet voice payments) are new, but every
  one of them is still about extending what Alexa itself can do or how
  manufacturers integrate *into* Alexa, not about opening "list/control a
  user's existing Alexa devices" to arbitrary third parties.
- **A real but janky workaround exists and is worth naming, not
  building against:** third-party services like Voice Monkey let a
  developer trigger pre-existing Alexa Routines or push TTS announcements
  to an Echo via a plain HTTP call — but only after the *end user*
  installs a specific Alexa Skill and manually authors Routines mapping
  phrases to actions in the Alexa app first. This is not Amazon-sanctioned
  general device control, has no state-reporting, and pushes real setup
  work onto the user per routine per household. Not a viable driver
  foundation.
- **Scope estimate: not buildable at all as a "control Echo/Alexa
  devices" driver** — this isn't an effort question, the capability
  doesn't exist for third parties today. **Do not build.**

### 3. Ring devices

- **This is the one finding that changed since 2026-09-08** (Ring wasn't
  in the earlier research at all). Ring has a real, current 2026 developer
  program — `developer.ring.com` and `developer.amazon.com/docs/ring/` —
  that is a genuine departure from Ring's historically tightly-restricted
  API access. It now supports OAuth2 account-linking, a "Ring MCP Server,"
  and both a Public Apps track (Ring Appstore) and a **Private Use Apps**
  track explicitly for "a small, known group of users without publishing"
  — i.e., a personal-use path exists and isn't blocked outright the way
  it once was.
- **But the capability surface is read/monitoring, not control.**
  Confirmed directly against Ring's own current docs (`get-started.html`,
  `program-requirements.html`): what's exposed is live video (WebRTC/RTSP/WHEP),
  motion events, doorbell presses, device online/offline status, and
  event history/clips. Nothing in Ring's official documentation exposes
  device *control* — no lock/unlock, no alarm arm/disarm, no light
  on/off. (An unofficial, reverse-engineered library, `dgreif/ring` /
  `ring-client-api`, does implement `location.disarm()`/`armHome()`/
  `armAway()` against Ring's *internal* app API, not the public developer
  API — the same unofficial-reverse-engineering risk profile this
  project already explicitly declines elsewhere, e.g. TCL/Hisense TVs in
  `docs/DEVICE_FEASIBILITY.md`.) This means even a fully-built Ring
  integration against the *real, sanctioned* API would not give Hearth
  the "universal remote" control interaction its `DeviceDriver` model is
  built around — at best a live-view/notifications feature, a genuinely
  different UI concept from every other driver in `src/drivers/`.
- **Auth/access reality:** developer account registration requires
  business/organization details and **government-issued photo ID identity
  verification** before any app — public or private — can be certified.
  This is real friction well beyond SmartThings' free self-serve developer
  workspace signup, and it's a one-time step gating *the developer*
  (Sean), not the end user, so it's a Hearth-project-level cost rather
  than a per-household one, unlike Fire TV/ADB's friction which lands on
  every household.
- **Scope estimate:** Multi-session even in the best case, because it
  needs the ID-verified developer registration, a real OAuth2
  account-linking flow (new infrastructure — see the SmartThings
  precedent note above), and Ring's certification process before any
  live testing — and the payoff at the end is monitoring/notifications,
  not the remote-control feature set Sean actually described wanting.
  **Do not build against the official API for a universal-remote use
  case**; if Sean specifically wants Ring doorbell notifications/live
  view as a *different* kind of Hearth feature later, that's a separate,
  smaller-scoped ADR, not part of "control my devices."

### 4. Amazon Smart Plug / other Amazon-linked smart home devices

- **No local API, no Matter support, cloud-only, Alexa-gated.** Amazon
  has not published a local control API or protocol for its own Smart
  Plug line, and — checked directly for 2026 — has not adopted Matter for
  it either (multiple current 2026 smart-plug buying-guide sources
  confirm: "Amazon Smart Plugs work only with Alexa and the Alexa app —
  they cannot be added to Google Home, Apple HomeKit, or SmartThings, and
  Amazon has not committed to Matter support"). Unlike Wemo or
  Matter-certified plugs, there is no local LAN endpoint and no
  third-party-controller path at all independent of the Alexa app.
- **Auth/access reality:** the only control surface is the Alexa app/
  cloud itself — which loops directly back into finding #2 above. There is
  no path to control an Amazon Smart Plug that doesn't require the exact
  "control a user's already-connected Alexa device" capability Amazon
  does not expose to third parties.
- **User setup burden / scope estimate: not buildable at all**, for the
  same structural reason as Echo/Alexa control — not a matter of effort,
  the platform provides no third-party entry point. **Do not build.**
  (If a household's Amazon Smart Plug needs remote-app control, the
  practical path is swapping it for a Matter-certified or SmartThings-
  compatible plug, which Hearth already supports today via the SmartThings
  driver — a product/hardware recommendation for Sean, not an engineering
  task.)

## Does SmartThings' OAuth pattern give Hearth a reusable foundation for Amazon LWA?

**No, not as reusable code — but it is a reusable architectural
pattern.** `SmartThingsOutletDriver.ts`/`SmartThingsClient.ts` do not
contain a generic OAuth client Hearth could point at Amazon's Login with
Amazon (LWA) endpoints; they're specific to (a) SmartThings turning out
to need zero phone-side tokens at all (webhook lifecycle delivery) and
(b) a confidential-client token exchange proxied through the Family
Command Center. If any Amazon integration ever needed real user-delegated
LWA/OAuth from the phone, Hearth would be starting that specific
implementation from scratch — `expo-auth-session` is installed but unused
end-to-end anywhere in this repo today. The transferable lesson, not
code, is: check the *actual* app/integration type's real auth delivery
mechanism before designing the token-storage shape, the same trap
ADR-HEARTH-042 fell into and corrected once already.

This is moot for all four Amazon device types researched here, since none
of them clears the more basic bar of "a capability worth building against
exists at all" for the universal-remote use case — Fire TV and Ring both
lack a control API (ADB-only / read-only respectively) and Echo/Alexa and
Amazon Smart Plug have no third-party control path of any kind.

## Decision

**Do not build any of the four Amazon-ecosystem integrations right now.**
None of them clear the bar this project has held every other driver to
(Sony/LG/Roku/Hue/SmartThings all had a real, current, control-capable
API verified against official docs before a line of driver code was
written):

| Device | Control API exists? | Verdict |
|---|---|---|
| Amazon Smart Plug | No (Alexa-only, no local/Matter path) | Do not build |
| Echo/Alexa | No (direction-mismatch, unchanged since 2026-09-08, no 2026 equivalent to Google's Home APIs) | Do not build |
| Fire TV | ADB only (debugging tool, shrinking as Vega OS spreads, heavy consumer setup friction) | Do not build |
| Ring | Yes, but read/monitoring only, not control (device control absent from the real 2026 program despite a genuine, non-gated developer track existing) | Do not build for remote-control; possible separate future feature for notifications/live-view only |

**If Sean wants any Amazon device actually controllable from Hearth
today**, the existing, proven path is what ADR-HEARTH-042 already
established: get the device into SmartThings (which supports a wide
range of third-party outlet/plug/sensor brands) and reach it through
`SmartThingsOutletDriver`, which already works. That is not a new
integration — it's using what's already built.

**Recommended build order if Sean insists on moving forward with one
anyway, ranked easiest/most-likely-to-actually-work first:**
1. **Ring (monitoring/notifications only, not "remote control")** — the
   only one of the four with a real, current, non-gated (if
   ID-verification-gated) developer program and sanctioned API at all.
   Still multi-session work (new OAuth infra, certification lead time)
   and a different feature shape than every existing Hearth driver — this
   would be a new UI concept (live view/event feed), not a `DeviceDriver`
   capability set.
2. **Fire TV via ADB** — technically possible, but the per-household
   Developer-Options setup burden and Vega OS's incompatibility make this
   a poor consumer feature; only worth it if Sean's own household
   hardware is confirmed Android-based Fire TV, and even then it's
   framed exactly like ADR-HEARTH-043's Pi-sideload dead end: possible
   for a technical owner, not shippable as a general feature.
3. **Echo/Alexa and Amazon Smart Plug — not buildable at all** today
   given Amazon's public API surface; nothing to rank here, they are
   both hard stops until Amazon publishes something structurally new
   (an Amazon equivalent of Google's Home APIs, if that ever ships).

## Consequences

- No code changes made — `src/drivers/`, `src/core/`, `src/ui/` are
  untouched by this ADR.
- `docs/DEVICE_FEASIBILITY.md` remains the authoritative feasibility
  matrix for TVs/streaming/audio/smart-home platforms; this ADR is the
  equivalent research for the four Amazon-specific device types Sean
  asked about, filling the Ring/Amazon-Smart-Plug gap that document never
  covered and re-confirming its Fire TV/Alexa findings are still current.
- If Amazon ever ships a genuine third-party "control a user's existing
  Alexa-connected devices" API (the Home-APIs equivalent), or opens
  device control (not just monitoring) on the Ring developer platform,
  this ADR's verdict should be re-checked against the new docs before
  reversing it — not assumed stale from memory, the same standard this
  ADR itself applied to the 2026-09-08 research.

Sources checked directly today (2026-09-12), not from training-data
memory: `developer.amazon.com/docs/fire-tv/remote-input.html`,
`developer.amazon.com/docs/fire-tv/connecting-adb-to-device.html`,
`developer.amazon.com/docs/alexaplus/device-apis/smart-home-general-apis.html`,
`developer.amazon.com/docs/alexaplus/smarthome/build-smart-home-addons-for-entertainment-devices.html`,
`developer.amazon.com/docs/alexaplus/device-apis/overview-smart-home-security.html`,
`developer.ring.com/`, `developer.amazon.com/docs/ring/get-started.html`,
`developer.amazon.com/docs/ring/program-requirements.html`,
`developers.home.google.com/apis` (comparison point), `voicemonkey.io/apis`,
plus multiple independent 2026 smart-plug buying-guide sources confirming
Amazon Smart Plug's lack of Matter/local-API support.
