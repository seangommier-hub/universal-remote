# ADR-HEARTH-054: Next integration roadmap — device categories beyond TV/Hue/SmartThings/Amazon

Date: 2026-09-12

## Status

Research/scoping only. No driver or screen code written. Same standard as
ADR-HEARTH-048: verify each candidate's real, current API/protocol against
primary sources before ranking it, rather than assuming from memory or
popularity.

## Context

Sean wants Hearth to grow into "an all-together packaged home management
app," not just a TV remote — Amazon-ecosystem-leaning for his own owned
hardware, but open to any brand that is genuinely technically feasible and
matched to what a typical smart-home household actually owns. Per
memory (`hearth_product_vision.md`) and this session's explicit
correction: new integrations must be justified by real feasibility, not
added speculatively for "comprehensiveness" — the same mistake flagged
around Hue's original addition.

ADR-HEARTH-048 (tonight, earlier) already closed the Amazon-ecosystem
question — Fire TV, Alexa, Ring, and Amazon Smart Plug are all "do not
build" or narrow-scope-only, re-confirmed against a live network scan
that found only Ring devices and one Amazon Smart Plug on Sean's actual
network (no fresh loophole there). This ADR is the deliberately
*separate* next question: what should Hearth build next, now that the
Amazon angle is closed out.

`docs/DEVICE_FEASIBILITY.md` (2026-09-08) already did deep, sourced
research across TVs, streaming, home audio, smart-home platforms, and
robot vacuums — that ground is not repeated here. This ADR fills the
categories that document never covered: generic Wi-Fi smart plugs
(non-SmartThings-mediated), smart locks, garage door openers, irrigation
controllers, security cameras beyond Ring, and AV receivers/soundbars
beyond Denon/Marantz.

**Architecture reviewed before this research:**
- `src/core/drivers/DeviceDriver.ts` — the interface every driver
  implements; isolation is the whole point (a bad Roomba integration
  can't break Samsung TVs).
- `src/core/types/Capability.ts` — capabilities added only once a real
  driver needs them.
- `src/core/network/httpRelayFallback.ts` / `wsRelayFallback.ts` — every
  existing HTTP/WS driver already gets FCC-relay-on-network-isolation for
  free by calling `requestWithRelayFallback`; this is reusable
  infrastructure, not something a new driver has to build.
- `src/drivers/tv/lg/LgWebOsDriver.ts`, `src/drivers/lighting/hue/*`,
  `src/drivers/outlet/smartthings/*` — the three existing shapes a new
  driver can take: (a) local WebSocket + on-device pairing prompt (LG/
  Samsung), (b) local REST + physical-button pairing (Hue), (c) cloud
  API reached through an FCC-hosted app/webhook, phone never holds
  credentials (SmartThings, post-ADR-042 course-correction).

## Research findings, per candidate category

### 1. Generic Wi-Fi smart plugs — Tuya local protocol

Most sub-$15 "smart plug" hardware sold under many storefront brands runs
Tuya's firmware/cloud stack underneath. `tinytuya` (actively maintained,
`jasonacox/tinytuya`) documents the real mechanism: a **local** AES-encrypted
TCP protocol (port 6668, plus UDP 6666/6667/7000 for discovery), gated by a
per-device "local key" obtained once via a **free** Tuya IoT Cloud project
signup. After that one-time key extraction, ongoing control is fully local —
no cloud round-trip, no recurring account dependency. Caveat found directly
in the docs: Tuya devices accept only **one TCP connection at a time** — the
official Tuya/SmartLife app must be closed for Hearth's connection to work,
the same category of constraint this project already models explicitly for
Narwal vacuums in `DEVICE_FEASIBILITY.md`.

- **Local or cloud:** Local for steady-state control; cloud touch required
  once per device for local-key extraction (free Tuya developer account,
  no approval wait, no fee).
- **Expo Go:** No — raw TCP socket + AES encryption is not available via
  Expo Go's JS APIs. Requires a Dev Build (already the project's standard
  per ADR-HEARTH-013) and a TCP socket module (e.g.
  `react-native-tcp-socket`, the same class of dependency already
  scoped for Denon/Marantz telnet in the existing feasibility doc).
- **Build complexity:** Medium — directly comparable to the Eufy Tuya
  driver already scoped in `DEVICE_FEASIBILITY.md` ("Medium-High,
  Medium-High priority... pays off across multiple vendors at once").
  A `TuyaOutletDriver` implementing `DeviceDriver` with a `power`
  capability (same one `HueLightDriver`/`SmartThingsOutletDriver`
  already reuse) is a same-shape addition, not a new architectural
  pattern.
- **New FCC infrastructure:** None required for the control path itself
  (TCP relay-fallback would need a new relay leg alongside the existing
  HTTP/WS ones in `src/core/network/` if a device sits on an isolated
  network segment — a moderate, well-precedented addition, not a new
  server capability class). The one-time local-key extraction can be a
  pure phone-side flow (Tuya's cloud API for that step is plain HTTPS).
- **Ownership:** Very broad — this is one of the most commonly owned
  smart-home device categories in real households, well beyond Sean's
  own network.

Sources: [jasonacox/tinytuya](https://github.com/jasonacox/tinytuya),
[tinytuya PyPI](https://pypi.org/project/tinytuya/),
[make-all/tuya-local (Home Assistant)](https://github.com/make-all/tuya-local).

### 2. TP-Link Kasa / Tapo smart plugs

`python-kasa` (actively maintained, the reference library used by Home
Assistant's own TP-Link integration) documents **classic Kasa** devices as
using an unauthenticated, unencrypted local UDP/TCP JSON protocol (port
9999) — no cloud account, no local-key extraction step at all, arguably
*lower* friction than Tuya's local protocol. Newer **Tapo** hardware is the
exception: it requires either enabling "Third-Party Compatibility" in the
Tapo app or a cloud-derived per-device key, closer to the Tuya model.

- **Local or cloud:** Local for classic Kasa, no cloud touch needed ever.
  Local-with-one-time-caveat for Tapo (must be manually enabled in-app;
  no developer registration or approval involved).
- **Expo Go:** No — same raw-socket constraint as Tuya, though the classic
  Kasa protocol is plaintext JSON (simpler than Tuya's AES framing).
- **Build complexity:** Low-Medium for classic Kasa (simplest local-plug
  protocol researched across both this ADR and the existing feasibility
  doc); Medium for Tapo parity.
- **New FCC infrastructure:** None beyond the same optional TCP relay leg
  noted for Tuya above.
- **Ownership:** Broad — TP-Link is one of the best-known smart-plug/bulb
  brands sold at every major retailer.

Sources: [python-kasa/python-kasa](https://github.com/python-kasa/python-kasa),
[python-kasa PyPI](https://pypi.org/project/python-kasa/0.6.0.dev0/).

### 3. Yamaha MusicCast AV receivers / soundbars

Yamaha's own "Extended Control API" is a plain, documented local HTTP/JSON
API (`http://<ip>/YamahaExtendedControl/v1/...`) covering power, volume,
input selection, and streaming-service control — no authentication scheme
at all (LAN-trust model, identical to Roku ECP's). This is the single
closest-to-ideal candidate found in this research round.

- **Local or cloud:** Fully local, zero auth, zero cloud dependency.
- **Expo Go:** Fully compatible for control — plain HTTP GET/POST via
  `fetch`, no native module needed (same class as Sony BRAVIA/Roku ECP
  today). Discovery would need a Dev Build only if SSDP auto-discovery is
  wanted; manual IP entry works with zero native code, matching this
  project's existing "no dev build needed for manual-IP control" pattern.
- **Build complexity:** Low — essentially the same shape as
  `SonyBraviaDriver`/`RokuEcpDriver`, this project's two easiest existing
  precedents. A `MusicCastDriver` reusing `requestWithRelayFallback`
  directly is a near copy-paste of the existing HTTP-driver pattern.
- **New FCC infrastructure:** None. Reuses the existing HTTP relay
  fallback as-is.
- **Ownership:** Broad among any household with a home-theater
  receiver or soundbar — a very common "TV adjacent" device category
  this app doesn't touch yet (volume/input on the actual sound system,
  not just the TV).

Sources: [Yamaha Extended Control API Specification (community-hosted PDF, sourced from Yamaha's own spec)](https://community.symcon.de/uploads/short-url/vRXaJXAn6vI2DSQYMHF0aqLbdir.pdf), [nymea.io — Yamaha AVR integration docs](https://www.nymea.io/documentation/resources/integrations/yamahaavr).

### 4. Smart locks (August, Yale, Schlage)

- **August:** No longer offers direct public developer API access as its
  primary path — August-authored community libraries (`py-august`) exist
  but the maintained, current path found is **Seam** (`docs.seam.co`), a
  paid third-party device-integration platform that brokers OAuth
  ("Connect Webview") to many lock/access-control brands including
  August. This is a commercial middleware dependency, not a direct
  vendor relationship.
- **Schlage:** Has a real, named developer program — the **Allegion
  Developer Portal** (`developer.allegion.com`) — but "Getting Started"
  explicitly requires contacting a Schlage Home Representative before
  building, i.e., a business-vetting gate before API access is even
  granted, not a self-serve signup. Scope is also narrow: WiFi-only
  models (Encode, Encode Plus, Encode Levers) — Bluetooth-only locks
  need to complete WiFi setup to even appear via the API.
- **Yale:** Found via the same Seam-brokered pattern as August (Yale
  owns August's parent company); no independent direct-vendor developer
  path distinct from Seam was found in this pass.

- **Local or cloud:** Cloud in all three cases — no local LAN control
  surface was found for any of the three brands researched.
- **Expo Go:** Fully compatible technically (all cloud HTTPS/OAuth) —
  the blocker is business/access friction, not a client-side capability
  gap.
- **Build complexity:** Low if going through Seam (one client library,
  one OAuth flow covering multiple brands) but with an ongoing
  **per-account cost** to Seam as a vendor dependency Hearth doesn't
  otherwise have; Medium-plus and gated by a manual approval
  relationship if going directly to Allegion.
- **New FCC infrastructure:** Likely yes — an OAuth-callback/token-relay
  endpoint on the Family Command Center, the same category of new
  server-side work SmartThings needed (ADR-HEARTH-042), for whichever
  path (Seam or Allegion) requires a confidential client.
- **Ownership:** Real but narrower than plugs — a genuine subset of
  households have a smart deadbolt, and locks carry materially higher
  stakes for a bug (an unlock failure/false command) than a TV or plug
  ever would.

Sources: [Seam — Get started with August locks](https://docs.seam.co/device-guides/get-started-with-august-locks), [Allegion Developer Portal — Getting Started with the Schlage Home API](https://developer.allegion.com/en/products/schlage-home/getting-started.html), [Allegion — Schlage Home API Best Practices](https://developer.allegion.com/en/products/schlage-home/best-practices.html).

### 5. Garage door openers (myQ, Tailwind, Meross, Genie/Aladdin Connect)

- **myQ (Chamberlain/LiftMaster) — the dominant already-owned platform:**
  Confirmed directly: Chamberlain deliberately and permanently blocked
  third-party API access starting late 2023 (this is why Home Assistant
  removed its own myQ integration in Nov 2023) and has publicly stated
  it will continue blocking third-party apps — not a deprecation, an
  active block. **No legitimate path exists for the opener most
  households actually already own.**
- **ratgdo** — a real, actively-maintained open-source local-control
  workaround, but it is a **physical hardware modification**: an ESP32
  board wired directly to the existing opener's control board, sitting
  on the same wires as the wall console to read/inject the door's
  rolling-code signal. This is not an app-side integration at all — it
  requires Sean (or any user) to physically open their garage door
  opener's housing and wire in a $60 board. Real and fully local, but
  categorically different from every other driver in this codebase.
- **Tailwind iQ3 / Meross MSG100 — replacement hardware with real local
  APIs:** Both have genuine, documented/community-confirmed local HTTP
  control (Tailwind: local HTTP server + a local-control-key, 10-second
  polling, explicitly "no cloud connection required"; Meross: local
  control achievable, though the vendor's primary path is still cloud/
  MQTT). Both require **buying a specific new opener/add-on device** —
  neither retrofits an opener a household already owns as invisibly as,
  say, a Hue bulb screws into an existing socket.
- **Genie/Aladdin Connect:** No official public developer API — only a
  reverse-engineered community library built from the Android app,
  cloud-only, and a live September 2026 security incident (a caching
  bug that leaked other users' garage doors into Home Assistant for ~18
  hours) is a concrete, current data point against relying on it.

- **Local or cloud:** Real local paths exist (Tailwind, Meross, ratgdo)
  but none of them apply to myQ, the platform actually installed in most
  garages already.
- **Build complexity:** Low for Tailwind specifically (plain local HTTP,
  no auth beyond a static key) if Sean or a user owns/buys one; not
  applicable as a general "control the opener you already have" feature,
  since myQ dominates existing installed base and is a hard block.
- **New FCC infrastructure:** None for Tailwind/Meross (local HTTP, same
  relay-fallback pattern as everything else).
- **Ownership:** This is the core problem — real local control exists
  only for opener hardware/add-ons almost nobody already owns, while the
  opener platform most households do own (myQ) is deliberately closed.

Sources: [Home Assistant blog — Removal of MyQ integration](https://www.home-assistant.io/blog/2023/11/06/removal-of-myq-integration/), [CEPRO — Chamberlain Group Blocks Third-Party Integrations for MyQ](https://www.cepro.com/news/chamberlain-group-blocks-third-party-integrations-for-myq-garage-door-controller/129813/), [Scott--R/Tailwind_Local_Control_API](https://github.com/Scott--R/Tailwind_Local_Control_API), [Genie cache bug leak writeup (Botmonster Tech, Sept 2026)](https://botmonster.com/smart-home/genie-cache-bug-leaked-garage-doors-to-random-home-assistant-users/).

### 6. Irrigation / sprinkler controllers (Rachio)

Rachio has a real, documented, self-serve official cloud API
(`rachio.readme.io`, API key generated directly from account settings, no
approval wait). A dedicated community feature request for a **local** API
has existed since at least 2023 and remains unfulfilled as of the most
recent 2026 discussion found — Rachio has never shipped local control.
Rachio was acquired by Rain Bird in October 2025, adding roadmap
uncertainty to an already cloud-only product.

- **Local or cloud:** Cloud only, confirmed no local path exists or is
  planned.
- **Expo Go:** Fully compatible (plain HTTPS + API key via `fetch`,
  the same shape as Ecobee/Nest already scoped in `DEVICE_FEASIBILITY.md`).
- **Build complexity:** Low — closely mirrors the Ecobee/Nest driver
  shape already researched for this project (cloud REST, OAuth or
  key-based, Expo-Go-native).
- **New FCC infrastructure:** None if a personal API key (self-serve,
  no confidential client) is sufficient; possible token-relay only if
  Rachio's model turns out to require one (unconfirmed — would need to
  be checked at implementation time, the same "don't assume the auth
  shape" lesson ADR-HEARTH-042 already learned once).
- **Ownership:** Narrower than plugs/AVRs — smart irrigation is a real
  but minority home-owner feature, not a renter/apartment-broad category.

Sources: [Rachio API documentation](https://rachio.readme.io/), [Rachio Community — "Please provide a local API to irrigation controller"](https://community.rachio.com/t/please-provide-a-local-api-to-irrigation-controller/42407).

### 7. Security cameras beyond Ring (UniFi Protect)

Ubiquiti shipped an **official Public Integration API** for UniFi Protect
in February 2026 (confirmed via Ubiquiti's own Help Center), a genuine
step away from the previously reverse-engineered-only access pattern —
and unlike Ring, this one is real local control: it runs against the
user's own self-hosted UniFi Protect console/NVR on their LAN, not a
vendor cloud.

- **Local or cloud:** Local — talks to the user's own on-premises UniFi
  Protect controller.
- **Expo Go:** Likely compatible for the REST surface (HTTPS to a local
  controller); would need direct verification of the exact 2026 API
  shape before committing, not assumed from this pass's search summaries
  alone.
- **Build complexity:** Medium — a real driver is buildable, but this
  is a fundamentally different feature shape than every existing Hearth
  driver (live video/event feed, not power/volume/input-style commands),
  the same UI-shape caveat ADR-HEARTH-048 already flagged for Ring.
- **New FCC infrastructure:** Possibly none (talks directly to a LAN
  controller) — but needs verification once implementation starts.
- **Ownership:** Narrow — this requires the household to already own
  UniFi networking gear and a Protect console, a prosumer/small-business
  investment, not something a "typical" household has the way they have
  a TV or a smart plug.

Sources: [Ubiquiti Help Center — Getting Started with the Official UniFi API](https://help.ui.com/hc/en-us/articles/30076656117655-Getting-Started-with-the-Official-UniFi-API), [uiprotect docs — migrating to the Public Integration API](https://uiprotect.readthedocs.io/).

## Ranking

**Best next investment (top 3) — real local control, low-to-medium build
effort, broad real-household ownership:**

1. **Yamaha MusicCast AV receivers/soundbars.** The single cleanest
   candidate found in this or the prior feasibility research: fully
   local, zero-auth, plain HTTP/JSON, Expo-Go-compatible for control,
   zero new FCC infrastructure, and near-identical in shape to the
   Sony BRAVIA driver already shipped. Broad ownership (any home-theater
   setup). This is the lowest-risk, highest-leverage next driver to
   build.
2. **TP-Link Kasa (classic) smart plugs.** Simpler local protocol than
   generic Tuya (no encryption, no local-key extraction step for
   classic hardware), one of the best-known smart-plug brands sold at
   retail, and a second, independent "power toggle" driver alongside
   SmartThings that doesn't require a user to already have SmartThings
   set up.
3. **Generic Tuya-protocol smart plugs.** Broadest raw ownership of any
   candidate researched (the majority of cheap smart plugs sold under
   many storefront brands are Tuya underneath) and a real, confirmed
   local-control path once a free one-time cloud key extraction is
   done — build effort is a known quantity, directly comparable to the
   Eufy vacuum driver this project already scoped as its recommended
   second robot-vacuum integration.

Together, #2 and #3 also mirror this project's own proven abstraction-
building pattern (Sony first, then Samsung+LG as a matched pair to prove
the interface) — two independent local smart-plug protocols sharing one
`power`-capability `OutletDriver` shape.

**Interesting, not yet — real friction, narrower ownership, or new
infrastructure that outweighs the payoff right now:**

- **Smart locks (August/Yale/Schlage).** Every real path found is
  cloud-only and gated by either a paid third-party middleware (Seam)
  or a manual business-vetting relationship (Allegion/Schlage) — the
  same "developer-account friction, not engineering friction" pattern
  ADR-HEARTH-048 found for Ring, plus materially higher stakes if a
  command bug ever affected a real lock.
- **Garage door openers.** The platform most households already have
  (myQ) is deliberately and permanently blocked by Chamberlain at the
  API level; the real local-control options (Tailwind, Meross) only
  work if a household buys specific new hardware, and ratgdo requires a
  physical wiring modification — none of these are an "add the opener
  you already have" feature the way every other driver in this app is.
- **Rachio irrigation.** Real, low-effort, self-serve cloud API — a
  legitimate future pick with a shape this project already knows how to
  build (Ecobee/Nest-style) — but meaningfully narrower ownership
  (homeowners with smart irrigation specifically) and fresh roadmap
  uncertainty from the Rain Bird acquisition. Worth a small future ADR
  once the plug/AVR wave is done, not part of this wave.
- **UniFi Protect (cameras beyond Ring).** The most technically
  legitimate camera path found (real 2026 official API, genuinely
  local) but requires a household to already own prosumer UniFi
  networking gear — too narrow an ownership base to prioritize over
  broadly-owned plugs/receivers, and it's a different feature shape
  (live view/events) than this app's remote-control interaction model,
  same caveat as Ring.

## Consequences

- No code changes made — `src/drivers/`, `src/core/`, `src/ui/` are
  untouched by this ADR.
- `docs/DEVICE_FEASIBILITY.md` remains the authoritative matrix for the
  categories it already covers (TVs, streaming, home audio, smart-home
  platforms, robot vacuums); this ADR is the equivalent research for the
  gap categories (generic smart plugs, locks, garage doors, irrigation,
  non-Ring cameras) that document never addressed.
- If Sean wants to proceed, the recommended build order is Yamaha
  MusicCast first (fastest, cleanest, proves nothing new architecturally
  since it's a straight copy of the Sony/Roku HTTP pattern), then the two
  local smart-plug protocols (Kasa classic, then generic Tuya) as a
  matched pair the same way Samsung+LG proved the TV abstraction.
- Smart locks, garage doors, irrigation, and non-Ring cameras are
  explicitly **not recommended for this wave** — each has a real,
  specific, named blocker (paid middleware/vetting gate, a dominant
  platform's active API block, narrow ownership, or narrow ownership
  plus a mismatched feature shape) rather than being generically
  deprioritized, so any of them can be revisited on its own terms later
  without re-researching from scratch.

Sources checked directly today (2026-09-12), not from training-data
memory: `github.com/jasonacox/tinytuya`, `github.com/python-kasa/python-kasa`,
`community.symcon.de` (Yamaha Extended Control API spec),
`docs.seam.co`, `developer.allegion.com`,
`home-assistant.io/blog/2023/11/06/removal-of-myq-integration`,
`cepro.com` (Chamberlain myQ blocking coverage),
`github.com/Scott--R/Tailwind_Local_Control_API`,
`botmonster.com` (Sept 2026 Genie/Aladdin Connect leak),
`rachio.readme.io`, `community.rachio.com`,
`help.ui.com` (UniFi Protect official API), `uiprotect.readthedocs.io`.
