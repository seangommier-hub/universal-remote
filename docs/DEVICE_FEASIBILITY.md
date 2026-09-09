# Hearth — Device Feasibility Matrix

**Purpose:** Technical feasibility research for controlling real consumer devices from the Hearth mobile app (Expo/React Native, iOS + Android). This document informs build-order and architecture decisions — specifically, whether a manufacturer-agnostic driver abstraction is viable, and which two ecosystems in the same category should be built first to prove that abstraction.

**Research date:** 2026-09-08. APIs change — re-verify before committing to an integration, especially anything marked "Experimental" or community-reverse-engineered.

**Methodology note on sourcing:** Where a manufacturer has no official public API (common for TVs and robot vacuums outside a few players), the only available sources are community reverse-engineering projects (GitHub, Home Assistant integrations). These are marked accordingly — they are not authoritative vendor documentation, and the app would depend on unofficial, unsupported protocols that can break without notice.

---

## TVs

### Samsung (Tizen / Smart TV API)

| Field | Value |
|---|---|
| Integration Method | Two layers: (1) an unofficial-but-widely-used WebSocket remote-control protocol on port 8001/8002 (`ws://<tv-ip>:8001/api/v2/channels/samsung.remote.control`) used by the official SmartThings app itself; (2) the official Tizen Web Device API / Samsung Product API, which is for building apps that *run on* the TV, not for remote-controlling it from a phone. |
| Local / Cloud | Local (WebSocket on LAN) for remote-control use case. |
| Discovery | SSDP/UPnP on the LAN. |
| Authentication | TV displays an on-screen "Allow/Deny" pairing prompt on first connection; app receives and stores a token for reuse. No cloud login required. |
| Capabilities | Key-press emulation (power, volume, input, navigation), app launching, some status queries. Not officially documented or supported by Samsung for this direction of control. |
| Expo Go | **Correction (2026-09-08, verified after initial research):** Partial and port-dependent, not simply "works." Older/some TVs support an **unencrypted** `ws://<ip>:8001/...` channel, which works fine in Expo Go's plain `WebSocket`. Modern Tizen TVs (~2020+) use an **encrypted** `wss://<ip>:8002/...` channel with a **self-signed certificate**, and React Native's built-in `WebSocket` has no way to accept an untrusted/self-signed cert (`rejectUnauthorized: false` is not supported) — confirmed via multiple open `facebook/react-native` issues (#18920, #30727) and the existence of a dedicated `react-native-websocket-self-signed` native package to work around exactly this. For a TV that only accepts the encrypted path, the control channel itself requires a Dev Build + a native TLS-bypass module, not just discovery. |
| Dev Build Required | Conditionally yes: not required if the target TV accepts the unencrypted `ws://8001` path with manual IP entry; required (for both discovery AND the control channel) if the TV requires the encrypted `wss://8002` path. Which applies depends on the specific TV/firmware and can only be confirmed by testing. |
| Native Module Required | Yes, for discovery (UDP/SSDP) regardless. Also yes for the control channel itself, but ONLY if the TV requires the encrypted `wss://8002` self-signed-cert path — e.g. `react-native-websocket-self-signed` or equivalent. |
| Platform Limitations | None iOS/Android-specific; TV-side firmware differences exist across model years. |
| API Maturity | Unofficial/reverse-engineered for remote control (widely used, stable in practice, but Samsung provides no support or guarantee); official Tizen Web Device API is stable but solves a different problem (on-TV apps, not remote control). |
| Engineering Complexity | Medium. |
| Priority | **High — build first or second TV integration.** Reverse-engineered protocol is mature and battle-tested (same one SmartThings uses), fully local, and the pairing flow is a good template for the driver abstraction. |

Sources: [Samsung Developer — Tizen Web Device API Reference](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references.html), [Samsung Developer — Network API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/network-api.html) (official docs cover on-TV app development, not the remote-control WebSocket protocol, which is community-documented via projects such as Home Assistant's `samsungtvws` integration).

---

### LG (webOS)

| Field | Value |
|---|---|
| Integration Method | Official-adjacent WebSocket protocol used by LG's own "LG ThinQ"/"LG Connect Apps" remote apps: connect to `wss://<tv-ip>:3001` (firmware from ~2023 on; `ws://<tv-ip>:3000` on pre-2018 sets), send a JSON handshake, and issue JSON commands. |
| Local / Cloud | Local (LAN WebSocket). |
| Discovery | TV broadcasts as `lgsmarttv.lan`; also discoverable via SSDP. |
| Authentication | On first connection the TV shows an on-screen pairing prompt ("LG Connect Apps"); accepting it returns a client key that the app stores and reuses. No cloud account needed. |
| Capabilities | Power, volume, input switching, app launching, media keys, some status/info queries. |
| Expo Go | Partially — same pattern as Samsung: WebSocket works in Expo Go, SSDP/mDNS discovery does not. |
| Dev Build Required | Yes, for auto-discovery; no for manual-IP connection. |
| Native Module Required | Yes, for discovery (UDP/SSDP module). |
| Platform Limitations | None iOS/Android-specific. Note: LG's "Developer Mode" app (for sideloading apps *onto* the TV) is unrelated to this remote-control use case and is not needed. |
| API Maturity | Stable in practice (same protocol LG's own apps use), but not an officially published third-party API — no formal support contract. |
| Engineering Complexity | Medium — nearly identical shape to Samsung's, which is exactly why it's a strong second TV vendor to validate the abstraction. |
| Priority | **High — ideal second TV integration alongside Samsung.** Same local WebSocket + pairing-token shape as Samsung, different JSON schema — this pairing is the clearest way to prove a manufacturer-agnostic TV driver interface. |

Sources: [webOS TV Developer portal](https://webostv.developer.lge.com/), [Connection Manager API Reference — webOS TV Developer](https://webostv.developer.lge.com/develop/references/connection-manager), community protocol documentation via [hobbyquaker/lgtv2](https://github.com/hobbyquaker/lgtv2) and [supersaiyanmode/PyWebOSTV](https://github.com/supersaiyanmode/PyWebOSTV).

---

### Sony (Bravia / Android TV)

| Field | Value |
|---|---|
| Integration Method | Official Sony BRAVIA REST API ("Simple IP Control" successor) — JSON-RPC-style POST requests to `http://<tv-ip>/sony/<service>` (e.g. `/sony/system`, `/sony/avContent`). Officially documented for both professional displays and consumer Bravia sets with "IP Control" enabled in settings. |
| Local / Cloud | Local (LAN HTTP). |
| Discovery | SSDP is supported for discovery; manual IP is also standard practice. |
| Authentication | Pre-Shared Key (PSK) sent as an `X-Auth-PSK` HTTP header, configured in the TV's IP Control settings; three permission levels (private/generic/etc.) gate sensitive vs. general endpoints. |
| Capabilities | Power, volume, input/source switching, app launching, playback control, some system/status info. |
| Expo Go | Fully — plain HTTP POST via `fetch`, no native module needed for the control channel itself. |
| Dev Build Required | No, for basic control with manual IP entry. Yes only if adding SSDP auto-discovery. |
| Native Module Required | No, for control. Yes (UDP module) only for auto-discovery. |
| Platform Limitations | None. |
| API Maturity | Stable — this is an officially documented, vendor-supported REST API, the strongest of the TV vendors researched. |
| Engineering Complexity | Low. |
| Priority | **Very high — best candidate for the very first TV integration.** Fully documented, officially supported, plain HTTP (works unmodified in Expo Go), simple PSK auth. |

Sources: [Sony BRAVIA Professional Displays Knowledge Center — REST API Guide](https://pro-bravia.sony.net/remote-display-control/rest-api/guide/), [Getting Started — BRAVIA REST API](https://pro-bravia.sony.net/develop/integrate/rest-api/spec/getting-started/), [REST API Basic Structure](https://pro-bravia.sony.net/remote-display-control/rest-api/structure/).

---

### Vizio (SmartCast API)

| Field | Value |
|---|---|
| Integration Method | Local HTTPS REST API on the LAN (SmartCast). VIZIO has a developer portal (developer.vizio.com) but the actual protocol used by community/production libraries is documented via reverse engineering (the widely-cited `exiva/Vizio_SmartCast_API` GitHub reference). |
| Local / Cloud | Local (LAN HTTPS), though TLS validation is awkward — the device certificate's CN is `BG2.prod.vizio.com`, so client code typically must disable strict cert validation. |
| Discovery | SSDP query (`ST: urn:schemas-kinoma-com:device:shell:1`). |
| Authentication | Pairing flow returns an `AUTH_TOKEN` sent as an `Auth` header on subsequent requests; a PIN shown on-screen must be entered to complete pairing. |
| Capabilities | Power, volume, input switching, app launching. |
| Expo Go | Partially — HTTPS requests work via `fetch`, but the self-signed/mismatched certificate handling that most Vizio libraries need is unreliable through Expo Go's networking stack, and SSDP discovery needs a native UDP module regardless. |
| Dev Build Required | Yes, in practice, for reliable TLS handling and discovery. |
| Native Module Required | Possibly, for custom TLS trust handling; definitely for UDP discovery. |
| Platform Limitations | None vendor-specific beyond the certificate quirk. |
| API Maturity | Experimental — there is a VIZIO developer portal, but the actual local-control protocol in real-world use is community-documented, not a first-party published spec. |
| Engineering Complexity | Medium-High (mostly due to TLS handling). |
| Priority | Medium — a reasonable third/fourth TV vendor once the driver abstraction is proven, not a first choice given the TLS friction. |

Sources: [exiva/Vizio_SmartCast_API (community reference documentation)](https://github.com/exiva/Vizio_SmartCast_API), [VIZIO Developer Portal](https://developer.vizio.com/), [pyvizio (PyPI)](https://pypi.org/project/pyvizio/).

---

### Roku TV (Roku ECP)

| Field | Value |
|---|---|
| Integration Method | Official Roku External Control Protocol (ECP) — a RESTful API on port 8060 (`http://<roku-ip>:8060`). Applies to Roku TVs and Roku streaming devices alike. |
| Local / Cloud | Local (LAN HTTP). |
| Discovery | SSDP. |
| Authentication | None required on most home networks by default (ECP has no auth token scheme); Roku added optional PIN-based pairing in some contexts but basic keypress/query endpoints are typically open on the LAN. |
| Capabilities | Keypress emulation (power, volume, nav, back/home), app/channel launching, deep linking into specific app content, device-info queries, installed-app listing. |
| Expo Go | Fully — plain HTTP GET/POST via `fetch`. |
| Dev Build Required | No, for control with manual IP. Yes only for SSDP auto-discovery. |
| Native Module Required | No for control; yes (UDP) for discovery. |
| Platform Limitations | None. |
| API Maturity | Stable — official, long-standing, well-documented Roku API. |
| Engineering Complexity | Low. |
| Priority | **Very high.** Along with Sony, this is one of the two easiest, most stable, fully-local, no-auth-friction integrations available — an excellent first or second entry in the "streaming device" and "TV" categories simultaneously since Roku TV and Roku streaming devices share ECP. |

Sources: [Roku Developer Docs — External Control Protocol (ECP)](https://developer.roku.com/dev/docs/external-control-api), [Roku SDK Documentation — External Control API (archive)](https://sdkdocs-archive.roku.com/External-Control-API_1611563.html).

---

### TCL

| Field | Value |
|---|---|
| Integration Method | No official public control API found. TCL's Android-TV-based sets can be controlled via ADB (Android Debug Bridge) once Developer Options/USB-Android-debugging is enabled on the TV, the same mechanism third-party control-system drivers (e.g. RTI) use. Non-Android-TV TCL sets (own OS) have no documented protocol found. |
| Local / Cloud | Local (ADB over LAN, if enabled), but ADB is a debugging interface, not a consumer control API. |
| Discovery | Manual IP; ADB itself has no standardized discovery. |
| Authentication | ADB debugging must be manually enabled on the TV and the connecting device's RSA key fingerprint approved once, on-screen. |
| Capabilities | Whatever `adb shell input keyevent` can trigger — power, volume, navigation, app launching via intents — but this is a developer/debugging surface, not a supported consumer integration point. |
| Expo Go | No — ADB requires a raw TCP socket and shelling out to Android's adb protocol; not available through any Expo Go JS API. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — a custom native ADB client module (no mainstream maintained RN library found); this is effectively bespoke native work. |
| Platform Limitations | ADB-over-network is an Android-TV-platform feature; it also requires the end user to manually enable Developer Options/network debugging on their TV, which is a poor consumer UX and something most non-technical users will never do. |
| API Maturity | Closed / no official API for this use case. ADB is a debugging tool, not a published control interface, and TCL could disable network ADB access in future firmware without notice. |
| Engineering Complexity | High. |
| Priority | Low. Not recommended as a build-order priority; the "enable Developer Options" requirement alone makes it a poor consumer feature relative to Sony/Roku/Samsung/LG. |

Sources: no official TCL developer/control API documentation was found. [RTI Driver Store — TCL TV Control (ADB-based, third-party commercial driver)](https://driverstore.rticontrol.com/driver/david-bowdler-tcl-tv-control), [prototux/TCL-TV-reverse-engineering](https://github.com/prototux/TCL-TV-reverse-engineering). **Unknown — needs further research** on whether TCL's own (non-Android-TV) firmware exposes any local protocol.

---

### Hisense (VIDAA)

| Field | Value |
|---|---|
| Integration Method | No official third-party remote-control API. Hisense/VIDAA publishes a "VIDAA Web App Development Guide," but that covers building HTML5 apps that run *on* the TV, not remote control *of* the TV. Community projects control Hisense sets via the TV's internal MQTT broker. |
| Local / Cloud | Local (MQTT broker running on the TV, LAN only). |
| Discovery | Manual IP typically; no standard discovery documented. |
| Authentication | Modern VIDAA firmware requires mutual TLS (client certificate + private key) to talk to the on-TV MQTT broker; the certificate is embedded in Hisense's own mobile app and is not publicly/legally redistributable, so some open-source projects require the user to extract/supply their own copy. |
| Capabilities | Power, volume, input, keypresses, source info — via reverse-engineered MQTT topics. |
| Expo Go | No — requires an MQTT client with mutual-TLS client-certificate support, which is a native networking capability outside Expo Go's JS APIs. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — an MQTT client library with mTLS support (e.g. wrapping a native MQTT SDK), plus a mechanism to obtain/store the required client certificate. |
| Platform Limitations | The client-certificate requirement/legal ambiguity is the core blocker — there's no clean, legally-safe way to ship the certificate the protocol requires inside a public app. |
| API Maturity | Closed for this use case — no official public control API; community MQTT approach is fragile and has a legal/licensing cloud over the certificate. |
| Engineering Complexity | High. |
| Priority | Low. The mutual-TLS certificate problem makes this one of the least viable TV integrations researched; do not prioritize. |

Sources: [Hisense TV Control (Vidaa OS) — companion-module-requests discussion](https://github.com/bitfocus/companion-module-requests/issues/837), [newAM/hisensetv (Python, MQTT-based)](https://github.com/newAM/hisensetv), VIDAA Web App Development Guide (covers on-TV app dev, not remote control).

---

## Streaming devices

### Apple TV / tvOS

| Field | Value |
|---|---|
| Integration Method | No public Apple-provided remote-control API. HomeKit's `HMHomeManager` explicitly does **not** expose Apple TV or HomePod as controllable accessories — they appear in the Home app but not in the HomeKit API. Third-party control (e.g. Home Assistant's Apple TV integration, Homebridge plugins) relies on `pyatv`, a reverse-engineered implementation of Apple's private remote protocols (MRP / AirPlay 2 companion-link pairing). |
| Local / Cloud | Local (LAN), once paired. |
| Discovery | mDNS/Bonjour. |
| Authentication | Device pairing via a PIN shown on the Apple TV screen (companion-link pairing), producing credentials stored for reuse — reverse-engineered from Apple's private protocol, not documented by Apple. |
| Capabilities | Via `pyatv`-style reverse engineering: playback control, navigation, power, app launching, now-playing info. |
| Expo Go | No — requires mDNS discovery (native module) and a from-scratch reimplementation of Apple's private, encrypted MRP protocol; no maintained JS/RN library exists to wrap this. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — this would require porting/wrapping `pyatv`-equivalent protocol logic natively (Swift/Kotlin), a substantial undertaking; no ready-made RN module found. |
| Platform Limitations | Apple deliberately does not expose this as a public API; the protocol is private and could change without notice in a tvOS update, breaking the integration. |
| API Maturity | Closed (no official API); reverse-engineered community protocol only. |
| Engineering Complexity | High. |
| Priority | Low relative to Roku/Fire TV/Google TV for a first streaming-device integration — no official API, real risk of breakage, and non-trivial native protocol work. Revisit only after other streaming integrations are proven. |

Sources: [Apple TV — Home Assistant integration docs](https://www.home-assistant.io/integrations/apple_tv/) (documents reliance on `pyatv`), [postlund/pyatv GitHub issue re: HomePod support](https://github.com/postlund/pyatv/issues/917), Apple Developer Forums discussion confirming Apple TV/HomePod are absent from the HomeKit API (https://developer.apple.com/forums/thread/95682).

---

### Roku (streaming devices)

Identical protocol and assessment to **Roku TV** above — Roku streaming sticks/boxes and Roku TVs share the same External Control Protocol (ECP) on port 8060.

| Field | Value |
|---|---|
| Integration Method | Official Roku ECP REST API, port 8060. |
| Local / Cloud | Local. |
| Discovery | SSDP. |
| Authentication | None required by default. |
| Capabilities | Keypress, app launching/deep-linking, device info, installed-app listing. |
| Expo Go | Fully (control channel); discovery needs a dev build. |
| Dev Build Required | No for manual-IP control; yes for auto-discovery. |
| Native Module Required | No for control; UDP module for discovery. |
| Platform Limitations | None. |
| API Maturity | Stable, official. |
| Engineering Complexity | Low. |
| Priority | **Very high — top pick for first streaming-device integration.** |

Sources: [Roku Developer Docs — ECP](https://developer.roku.com/dev/docs/external-control-api).

---

### Amazon Fire TV

| Field | Value |
|---|---|
| Integration Method | No official IP/REST control API for end-user remote-control apps. Official Amazon docs cover (a) the Fire TV Integration SDK — for building apps *that run on* Fire TV — and (b) ADB, which is a developer/debugging tool, not a consumer control surface. Community solutions send Android keyevents over ADB (`adb shell input keyevent ...`) once ADB debugging is enabled on the device. |
| Local / Cloud | Local (ADB over LAN), if enabled. |
| Discovery | No standard discovery; manual IP + ADB connect. |
| Authentication | ADB debugging must be manually enabled in Fire TV's developer settings, and the connecting device's key must be approved once on-screen — same friction/UX problem as TCL. |
| Capabilities | Keyevents (power via HDMI-CEC passthrough where supported, volume, navigation, media keys), app launching via ADB intents. |
| Expo Go | No — raw ADB/TCP protocol implementation, not available via Expo Go JS APIs. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — custom ADB client (no well-maintained RN wrapper found); bespoke native work. |
| Platform Limitations | Requires the end user to dig into Fire TV developer settings and enable ADB debugging — a significant, non-obvious setup step for a consumer product. Amazon could restrict this at any time. |
| API Maturity | Closed for this use case (no official consumer control API); ADB-based community approach only. |
| Engineering Complexity | High. |
| Priority | Low as a first pick. The "enable ADB debugging" onboarding step is a serious consumer-UX blocker; deprioritize below Roku, Chromecast, and Google TV. |

Sources: [Amazon Developer — Remote Control Input (Fire TV)](https://developer.amazon.com/docs/fire-tv/remote-input.html), [Amazon Developer — Connect to Fire TV Through ADB](https://developer.amazon.com/docs/fire-tv/connecting-adb-to-device.html), community discussion confirming no IP/REST control API exists ([XDA Forums](https://xdaforums.com/t/ip-rest-api-for-controlling-fire-tv.3290313/)).

---

### Google TV / Android TV

| Field | Value |
|---|---|
| Integration Method | Google's own "Google TV" remote app uses a private/undocumented local protocol (Google TV Pairing Protocol + "Anymote" protocol) — not published for third-party use. Community remote-control projects instead use ADB over the network, same pattern as Fire TV (Google TV runs on Android TV OS, so the underlying mechanism is the same). |
| Local / Cloud | Local (ADB over LAN, once enabled) or Google's own encrypted local protocol (undocumented, proprietary). |
| Discovery | Community tools use mDNS + ADB port scanning; no official discovery API. |
| Authentication | ADB debugging must be enabled on the TV and a connection key approved on-screen — same friction as Fire TV. |
| Capabilities | Same class as Fire TV: keyevents, app launching. |
| Expo Go | No — same ADB/TCP + native protocol requirements as Fire TV. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — custom ADB or Anymote-protocol client; no maintained RN library found. |
| Platform Limitations | Same "enable Developer Options / network debugging" consumer friction as Fire TV; Google's own pairing protocol is fully closed/undocumented. |
| API Maturity | Closed for third-party developers; official Google TV app uses a private protocol. |
| Engineering Complexity | High. |
| Priority | Low as a first pick, for the same reasons as Fire TV. |

Sources: [Google's Android TV Community — thread on Android TV remote protocol availability](https://support.google.com/androidtv/thread/100559736/the-availability-of-android-tv-remote-protocol-tcp-ip-documentation-or-sdk?hl=en), community tools ([Legvan/tv-remote](https://github.com/Legvan/tv-remote), [canbedir/television-controller](https://github.com/canbedir/television-controller)) confirming ADB is the only practical local mechanism.

---

### Chromecast (Google Cast SDK)

| Field | Value |
|---|---|
| Integration Method | Official Google Cast SDK, wrapped for React Native by the well-maintained `react-native-google-cast` library (native SDK wrapper, not a raw local protocol you implement yourself). |
| Local / Cloud | Local — Cast device discovery and session/media control happen over the LAN (mDNS + Cast protocol), no cloud dependency for basic casting. |
| Discovery | Handled automatically by the Cast SDK (native, via mDNS). |
| Authentication | None user-facing beyond being on the same Wi-Fi network; the SDK handles session negotiation. |
| Capabilities | This is fundamentally a **media-casting** API (send/control a media URL/stream to the device — play/pause/seek/volume/queue), not a general "remote control" like ECP/webOS/Tizen. Good fit for "cast content" features, not for TV power/input switching. |
| Expo Go | No — explicitly requires custom native code (confirmed by the library's own docs: "cannot be used in Expo Go... requires custom native code"). |
| Dev Build Required | Yes (works via `expo prebuild`/EAS Build with the library's Expo config plugin). |
| Native Module Required | Yes — `react-native-google-cast`, which wraps Google's official Cast SDK for iOS and Android. |
| Platform Limitations | None beyond the dev-build requirement; the library is actively maintained and Expo-aware (ships a config plugin). |
| API Maturity | Stable — official Google SDK, mature React Native wrapper. |
| Engineering Complexity | Low-Medium (mostly the dev-build/config-plugin setup, not protocol work). |
| Priority | Medium-High — valuable but distinct capability (casting, not remote control); a good complement once basic remote-control TV/streaming drivers are proven, since it's a different interaction model. |

Sources: [react-native-google-cast (GitHub)](https://github.com/react-native-google-cast/react-native-google-cast), [react-native-google-cast — Installation docs](https://react-native-google-cast.github.io/docs/getting-started/installation).

---

## Home audio

### Apple HomePod

| Field | Value |
|---|---|
| Integration Method | No public control API. As noted under HomeKit/Apple TV above, HomePod is explicitly excluded from the HomeKit API despite appearing in the Home app. The only sanctioned integration surface for third-party apps is SiriKit media intents (letting a user say "Hey Siri, play X on [Your App]" — voice-initiated from the *content app's* side, not programmatic control from a remote-control app) and AirPlay 2 (for streaming audio to it, not for controlling it as a device). |
| Local / Cloud | N/A — no control channel exists for this use case. |
| Discovery | N/A. |
| Authentication | N/A. |
| Capabilities | None, via any public/sanctioned API, for "control this HomePod from a third-party remote-control app." AirPlay 2 allows streaming audio to it; SiriKit allows Siri to invoke your content app, not the reverse. |
| Expo Go | No — not applicable; there is no API surface to call. |
| Dev Build Required | N/A. |
| Native Module Required | N/A. |
| Platform Limitations | Total — this is an Apple platform restriction, not an engineering gap. |
| API Maturity | Closed. |
| Engineering Complexity | N/A (not buildable as a remote-control target with public APIs). |
| Priority | **Do not build.** Mark as explicitly unsupported in product scope rather than spending engineering time; only AirPlay-based audio streaming (a different feature, not "control") is realistically available. |

Sources: [Apple Developer Forums — Apple TV/HomePod absent from HomeKit API](https://developer.apple.com/forums/thread/95682), [Integrate SiriKit Media Intents with HomePod — Apple Developer Tech Talk](https://developer.apple.com/videos/play/tech-talks/10854/).

---

### Sonos (local control API)

| Field | Value |
|---|---|
| Integration Method | Sonos's *official* developer-facing "Control API" (developer.sonos.com) is a **cloud** API (`api.ws.sonos.com`), not local. A separate "LAN API" exists and is used internally/by select partners, but per Sonos's own community forum, **the LAN Control API is not available for wide release and has no public documentation.** Widely-used local control in the community instead goes through the older UPnP/SOAP-based control surface that Sonos speakers have always exposed on the LAN, wrapped by projects like `node-sonos-http-api`. |
| Local / Cloud | Cloud, for the official public Control API. Local control is possible only via the legacy undocumented UPnP/SOAP surface (community-reverse-engineered) or a not-publicly-released LAN API. |
| Discovery | SSDP/UPnP for the legacy local surface. |
| Authentication | Official cloud Control API: OAuth2 (Sonos account login). Legacy local UPnP surface: none (open on LAN). |
| Capabilities | Play/pause/skip, volume, grouping/multi-room, queue management — well covered either way. |
| Expo Go | Cloud API: fully (plain HTTPS/OAuth2 via `fetch`). Legacy local UPnP: partially — the underlying calls are HTTP/SOAP over the LAN, so `fetch` can technically make the calls, but SSDP discovery needs a native module. |
| Dev Build Required | No for the cloud API; yes for local-network auto-discovery. |
| Native Module Required | No for cloud API control; UDP/SSDP module for local discovery. |
| Platform Limitations | None. |
| API Maturity | Cloud Control API: stable, official. Local control: unofficial/legacy, works today but not Sonos's forward-looking supported path (and the officially-planned LAN API is not public). |
| Engineering Complexity | Low (cloud) to Medium (local/legacy). |
| Priority | Medium — given "local-first is preferred" but Sonos's own sanctioned local path isn't public, the pragmatic choice is to start with the official cloud Control API (stable, documented, OAuth) and treat local UPnP control as a possible local-fallback enhancement later. |

Sources: [Sonos Developer — Control API reference](https://developer.sonos.com/reference/control-api-list/), [Sonos docs — About Control API](https://docs.sonos.com/reference/about-control-api), [Sonos Community — "Where is the LAN API documented?" (confirms LAN Control API not publicly released)](https://en.community.sonos.com/advanced-setups-229133/where-is-the-lan-api-documented-6930288), [jishi/node-sonos-http-api (community local bridge)](https://github.com/jishi/node-sonos-http-api).

---

### Denon / Marantz (HEOS / Telnet)

| Field | Value |
|---|---|
| Integration Method | Two overlapping options, neither officially/comprehensively documented for the general public: (1) a raw Telnet-based AVR control protocol (Denon/Marantz "serial-over-telnet" command set) on TCP port 23/some models use 8080-ish variants for HEOS-only text protocol; (2) HEOS itself, which advertises via SSDP and has its own text-based command protocol used by the HEOS app. |
| Local / Cloud | Local (LAN Telnet/HEOS protocol). |
| Discovery | SSDP for HEOS-capable devices. |
| Authentication | None — LAN Telnet/HEOS protocol is unauthenticated by default (relies on network-level trust). |
| Capabilities | Power, volume, input/source selection, surround mode, HEOS group/multi-room control, now-playing info. |
| Expo Go | No — Telnet is a raw TCP socket protocol, not exposed by any Expo Go JS API (no `fetch`/`WebSocket` equivalent for raw TCP). |
| Dev Build Required | Yes. |
| Native Module Required | Yes — a raw TCP socket module (e.g. `react-native-tcp-socket`). |
| Platform Limitations | None vendor-specific; documentation is entirely community-sourced (no first-party Denon/Marantz developer portal was found), so the protocol could change without notice. |
| API Maturity | Unofficial/community-documented only — "poor understandable API documentation" per community sources; functionally stable in practice (long-lived protocol) but not vendor-supported. |
| Engineering Complexity | Medium (protocol itself is simple text commands; the work is the raw-socket native module, not the command set). |
| Priority | Medium — reasonable second or third home-audio integration once the driver abstraction pattern (in this case, TCP-socket-based rather than HTTP-based) is proven elsewhere. |

Sources: [k3erg/marantz-denon-telnet — API.md (community protocol documentation)](https://github.com/k3erg/marantz-denon-telnet/blob/master/docs/API.md), [frawau/aiomadeavr](https://github.com/frawau/aiomadeavr), [Denon/Marantz — openHAB binding docs](https://www.openhab.org/addons/bindings/denonmarantz/). **Unknown — needs further research**: whether Denon/Marantz publish any first-party protocol spec beyond community reverse engineering.

---

## Smart home platforms

### Philips Hue (local bridge API)

| Field | Value |
|---|---|
| Integration Method | Official Philips Hue Bridge local REST API (v1, JSON over HTTP) and newer v2 API (HTTPS, adds an eventing/streaming interface). Both run directly on the Hue Bridge hardware on the LAN. |
| Local / Cloud | Local (talks directly to the bridge on the LAN; no cloud required for local-network control). |
| Discovery | mDNS, or Philips's own N-UPnP discovery endpoint (`discovery.meethue.com`, cloud-assisted discovery of the bridge's local IP), or SSDP. |
| Authentication | One-time pairing: app calls the bridge's `/api` endpoint while the user physically presses the bridge's link button within ~30 seconds; the bridge returns a username/API key stored for reuse. V2 additionally supports a local HTTPS client-key flow. |
| Capabilities | Full light control (on/off, brightness, color, color temperature), scenes, groups/rooms, sensors, some official third-party accessory support (motion sensors, switches). |
| Expo Go | Fully for v1 (plain HTTP `fetch`); v2 over HTTPS with the bridge's self-signed cert needs care but is generally workable via `fetch` too. mDNS discovery needs a native module, but the cloud-assisted N-UPnP discovery endpoint is a plain HTTPS call and works in Expo Go as a discovery fallback. |
| Dev Build Required | No — this is one of the few ecosystems fully usable in Expo Go end-to-end (control + discovery via the cloud-assisted endpoint). |
| Native Module Required | No, if using cloud-assisted discovery; optional native mDNS module for pure-local discovery without any cloud touchpoint. |
| Platform Limitations | None. |
| API Maturity | Stable, official, one of the best-documented consumer smart-home APIs available. |
| Engineering Complexity | Low. |
| Priority | **Very high — top pick for first lighting/smart-home platform integration.** Fully local, officially documented, physical-button pairing is simple and secure, and it is one of the very few ecosystems that works fully in Expo Go without a dev build. |

Sources: [Philips Hue Developer Program](https://developers.meethue.com/), [Get Started — Philips Hue Developer Program](https://developers.meethue.com/develop/get-started-2/), [Philips Hue API — unofficial reference documentation](https://www.burgestrand.se/hue-api/).

---

### Home Assistant (REST / WebSocket API)

| Field | Value |
|---|---|
| Integration Method | Official REST API (`/api/...`) and WebSocket API (`/api/websocket`) exposed by a user's own Home Assistant instance. |
| Local / Cloud | Local (self-hosted on the user's LAN by default; can also be reverse-proxied to the internet by the user, but that's their choice/config, not Home Assistant's architecture). |
| Discovery | Home Assistant instances typically advertise via mDNS (`_home-assistant._tcp.local`), or the user supplies the URL directly. |
| Authentication | Bearer token — either a Long-Lived Access Token (user-generated in their HA profile, valid up to ~10 years) or a full OAuth2 flow for a registered third-party integration. |
| Capabilities | Effectively everything Home Assistant itself can see/control — since HA already aggregates hundreds of integrations (Hue, Sonos, Ecobee, Matter, etc.), this is a high-leverage "meta-integration": one driver against Home Assistant's API could indirectly reach many device types a user has already set up in HA. |
| Expo Go | Fully — plain HTTPS/WebSocket via `fetch`/`WebSocket`, both native to Expo Go's JS runtime. mDNS discovery needs a native module, but manual URL entry (very normal for HA power users) works fine without one. |
| Dev Build Required | No. |
| Native Module Required | No. |
| Platform Limitations | None — but this integration only helps users who already run Home Assistant, which is a meaningful subset of the target market (enthusiasts), not the general consumer. |
| API Maturity | Stable, official, extremely well documented. |
| Engineering Complexity | Low. |
| Priority | High as a "power-user multiplier" — not one of the two required same-category integrations for proving the driver abstraction (since it's an aggregator, not a single-brand smart-home platform), but very high ROI once the abstraction pattern is validated, since it unlocks a long tail of devices through one driver. |

Sources: [Home Assistant Developer Docs — WebSocket API](https://developers.home-assistant.io/docs/api/websocket/), [Home Assistant Developer Docs — REST API](https://github.com/home-assistant/developers.home-assistant/blob/master/docs/api/rest.md), [Home Assistant — WebSocket API integration docs](https://www.home-assistant.io/integrations/websocket_api/).

---

### Amazon Alexa (Smart Home Skill API / Alexa Voice Service)

| Field | Value |
|---|---|
| Integration Method | **Important direction mismatch for this project's use case.** The Smart Home Skill API is for making *your own* device/cloud controllable *by* Alexa (i.e., you'd build a skill so Alexa can turn your product on/off) — it is not a mechanism for a third-party app like Hearth to control devices a user has *already* connected to their Alexa account. Alexa Voice Service (AVS) is a separate SDK for embedding the Alexa voice assistant itself into a product; it also does not provide "list/control my existing smart home devices" access to arbitrary third-party apps. |
| Local / Cloud | Cloud (both Smart Home Skill API and AVS are cloud-mediated). |
| Discovery | N/A for this use case. |
| Authentication | Both use Amazon OAuth/LWA (Login with Amazon), but again for the wrong direction of integration. |
| Capabilities | None applicable to "control a user's existing Alexa-connected devices from Hearth" — there is no general-purpose public Amazon API for that. |
| Expo Go | N/A. |
| Dev Build Required | N/A. |
| Native Module Required | N/A. |
| Platform Limitations | Architectural: Amazon's public APIs solve "let Alexa control my device," not "let my app control the user's Alexa-connected devices." |
| API Maturity | Closed, for the specific capability this project would need. |
| Engineering Complexity | N/A as scoped; would require either (a) partnering/reverse-direction integration (making Hearth a Smart Home Skill target, which is backwards from the goal) or (b) controlling individual devices directly via their own native APIs (Hue, SmartThings, etc.) rather than through Alexa at all. |
| Priority | **Do not build against Alexa directly for this purpose.** Reach the same end devices through their own native ecosystem APIs instead. |

Sources: [Alexa Skills Kit — Understand Smart Home Skills](https://developer.amazon.com/en-US/docs/alexa/smarthome/understand-the-smart-home-skill-api.html), [Alexa Skills Kit — Smart Home Development Options](https://developer.amazon.com/en-US/docs/alexa/smarthome/development-options.html).

---

### Google Home / Google Smart Home API

| Field | Value |
|---|---|
| Integration Method | Historically the same direction-mismatch problem as Alexa (the "Smart Home Actions"/Smart Home API let *your* device be controlled *by* Google Assistant, not the reverse). However, Google has begun opening this up: new **Google Home APIs** (Device, Structure, Commissioning, and Automation APIs) are in public developer beta (Android first, iOS "expected soon" per Google's announcement) and explicitly let third-party apps list, control, and commission devices already in a user's Google Home ecosystem — this is a genuinely new capability, not the old inverse-direction Smart Home Action model. |
| Local / Cloud | The new Home APIs are described by Google as enabling **local** control for Matter devices specifically (Nest hubs/speakers/Chromecast/Google TV devices on Android 14+ act as local Matter controllers); non-Matter devices in a user's Home ecosystem likely still route through Google's cloud. |
| Discovery | Handled by the Home APIs/SDK itself (device structure API surfaces the user's existing device graph — no separate LAN discovery needed from the app's side). |
| Authentication | Google account OAuth (user grants the app access to their Google Home structure). |
| Capabilities | Per Google's announcement: device listing across a user's ~600M-device install base, control, commissioning of new Matter devices, and automation creation — a broad, high-value surface if it matures. |
| Expo Go | No — this requires Google's native Android/iOS Home APIs SDK, not a REST/WebSocket surface callable from `fetch`. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — no React Native wrapper exists yet (the SDK itself is very new/beta); would require writing a custom native module wrapping Google's Android/iOS SDKs. |
| Platform Limitations | Beta status: Android is further along than iOS ("iOS version expected soon" as of the source found) — a real risk for a cross-platform app that needs feature parity. |
| API Maturity | Experimental / early public beta — promising but immature; treat as directionally important, not yet production-ready. |
| Engineering Complexity | High (new SDK, native wrapper needed, platform-parity risk). |
| Priority | Medium — worth prototyping and monitoring closely (this could become a major "aggregator" surface like Home Assistant, but from Google), but too immature/Android-first to be a first-wave build target. Re-evaluate once iOS parity ships. |

Sources: [Google Developers Blog — "Home APIs: Enabling all developers to build for the home"](https://developers.googleblog.com/en/home-apis-enabling-all-developers-to-build-for-the-home/), [Google Home Developers — Enable local fulfillment for Cloud-to-cloud integrations](https://developers.home.google.com/codelabs/smarthome-local), [Android Police — "Full local control is coming to Matter devices on Google Home hubs"](https://www.androidpolice.com/google-home-local-matter/).

---

### Matter (CSA spec, local IP-based)

| Field | Value |
|---|---|
| Integration Method | Matter is an open standard (Connectivity Standards Alliance) with a full protocol spec and open-source SDK (`connectedhomeip`) for building a Matter *controller* (or accessory) that commissions and controls Matter-certified devices directly. |
| Local / Cloud | Local by design — Matter's core design goal is that device control works over the LAN/Thread without a cloud round-trip. |
| Discovery | Matter uses IP-based (IPv6) discovery/commissioning over Wi-Fi, Ethernet, or Thread. |
| Authentication | Device commissioning uses a setup code/QR code and a certificate-based secure-channel handshake (defined by the Matter spec) — this is a full cryptographic pairing ceremony, not a simple token exchange. |
| Capabilities | Whatever the underlying Matter device "cluster" supports (lighting, plugs, thermostats, locks, sensors, and increasingly robot vacuums per Matter 1.x extensions) — potentially very broad, since this is the industry's actual convergence standard. |
| Expo Go | No — implementing a Matter controller requires the CSA's native SDK (C++ core, `connectedhomeip`), Bluetooth LE (for initial commissioning) and Thread/mDNS networking — none of which are available through Expo Go's JS runtime. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — and this is a heavyweight one: no mature, actively-maintained React Native wrapper for a full Matter controller SDK was identified in this research. Realistically this means bridging Apple's/Google's own Matter controller frameworks (HomeKit's Matter support on iOS, Google Home APIs' Matter support on Android) rather than implementing the CSA SDK directly from a mobile app — which reintroduces the platform-specific-API problem this app is trying to abstract away. |
| Platform Limitations | Significant — iOS and Android each have their own native Matter-controller entry points (via HomeKit and via Google Home APIs, respectively) rather than one common mobile SDK; building "raw Matter" support outside of those two ecosystem controllers is a substantial standalone-SDK undertaking. |
| API Maturity | The spec itself is stable and mature (CSA-published, versioned); mobile-app-consumable tooling for building a from-scratch Matter controller is comparatively immature. |
| Engineering Complexity | High. |
| Priority | Medium-Low for a first wave. Matter is strategically important long-term (it is the industry's convergence point), but the most practical near-term path to Matter devices is *through* HomeKit (iOS) and Google Home APIs (Android) rather than a raw Matter SDK — so this is best revisited once those two platform integrations are further along, rather than built as a fifth, parallel native stack. |

Sources: [CSA-IOT — Matter FAQ](https://csa-iot.org/all-solutions/matter/matter-faq/), [CSA-IOT — Build With Matter](https://csa-iot.org/all-solutions/matter/), [Home Assistant — Matter integration docs](https://www.home-assistant.io/integrations/matter/) (illustrates the local-IPv6/Thread architecture in practice).

---

### Apple HomeKit (native-only, no public REST API)

| Field | Value |
|---|---|
| Integration Method | Native-only: Apple's `HomeKit` framework (`HMHomeManager` and related classes), consumable only from native Swift/Objective-C code with the `com.apple.developer.homekit` entitlement. There is no REST/HTTP API Apple provides. |
| Local / Cloud | Local (HomeKit's actual accessory protocol, HAP, is a local encrypted protocol; Apple's Home app also syncs state via iCloud for remote access, but the entitlement/framework itself is what an app must use — there's no way around it with HTTP calls). |
| Discovery | Handled internally by the HomeKit framework once the app has home-access permission from the user — not something the app implements itself. |
| Authentication | User grants "Home" access permission via the standard iOS permission prompt (like Contacts/Photos); no token management needed by the app. |
| Capabilities | Full local control of all HomeKit accessories the user has set up (lights, locks, thermostats, sensors, and now Matter devices bridged into Home), scenes, automations. |
| Expo Go | No — requires the native HomeKit framework and a special entitlement; there is no JS-callable surface at all. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — a custom native module wrapping `HMHomeManager`/HomeKit (no ready-made maintained RN wrapper with full functionality was identified; this would likely be bespoke Swift native-module work). |
| Platform Limitations | **iOS/iPadOS only — there is no HomeKit equivalent or bridge on Android.** This means a HomeKit integration can never be part of a true cross-platform manufacturer-agnostic driver; it would need to be an iOS-only enhancement layered on top of the cross-platform core. |
| API Maturity | Stable (Apple's own framework), but platform-exclusive and requires a special entitlement (Apple must grant `com.apple.developer.homekit` for the app's provisioning profile). |
| Engineering Complexity | High (native Swift module work) and structurally limited (iOS-only). |
| Priority | Low for the cross-platform driver-abstraction goal specifically — not because it's technically bad, but because it cannot be the "second integration in the category" proof point for a manufacturer-agnostic *cross-platform* abstraction, since Android has no equivalent. Worth a later iOS-only enhancement, not a first-wave pick. |

Sources: [Apple Developer Documentation — HMHomeManager](https://developer.apple.com/documentation/homekit/hmhomemanager), [Apple Developer Forums — confirmation of no public REST/web API for HomeKit](https://developer.apple.com/forums/thread/101818).

---

### SmartThings (Samsung, cloud API)

| Field | Value |
|---|---|
| Integration Method | Official SmartThings Cloud REST API (`api.smartthings.com`). |
| Local / Cloud | Cloud. |
| Discovery | The API lists devices already registered to the user's SmartThings account/location — no LAN discovery needed from the app. |
| Authentication | OAuth 2.0 Bearer tokens for production integrations (personal access tokens are explicitly documented as being for short-term testing/evaluation only, not production use). |
| Capabilities | Broad — SmartThings aggregates a large number of third-party device types (plugs, sensors, lights, locks, some TVs/appliances via Samsung's own ecosystem), all controllable through one consistent REST model (capabilities/components). |
| Expo Go | Fully — plain HTTPS + OAuth2 via `fetch`, no native module required. |
| Dev Build Required | No. |
| Native Module Required | No. |
| Platform Limitations | None. |
| API Maturity | Stable, official, actively maintained (has a documented release-notes cadence). |
| Engineering Complexity | Low. |
| Priority | High — one of the easiest smart-home platforms to integrate (fully Expo-Go-compatible, OAuth2 is standard, good docs) and, like Home Assistant, functions as a useful aggregator across many device brands via one API. Good candidate for an early smart-home-platform integration, though it is cloud-only (a tradeoff against the "local-first" preference). |

Sources: [SmartThings Developer Documentation — Introduction](https://developer.smartthings.com/docs/enterprise/get-started/introduction), [SmartThings — Quick Start Guide to Testing the API](https://developer.smartthings.com/docs/getting-started/quickstart), [SmartThings — Add SmartThings to Your Authorization Server](https://developer.smartthings.com/docs/devices/cloud-connected/auth-server).

---

### Ecobee

| Field | Value |
|---|---|
| Integration Method | Official Ecobee REST-like JSON API over OAuth 2.0. |
| Local / Cloud | Cloud. |
| Discovery | N/A — API operates against the user's registered thermostats/account, no LAN discovery. |
| Authentication | PIN-based OAuth2 authorization flow: the app requests a PIN, the user enters it in the Ecobee web portal within a time window, and the app polls for access/refresh tokens (JWT-format access tokens). |
| Capabilities | Thermostat mode/setpoint control, sensor readings, some equipment status. |
| Expo Go | Fully — plain HTTPS/OAuth2 via `fetch`. |
| Dev Build Required | No. |
| Native Module Required | No. |
| Platform Limitations | **Important caveat found during research: Ecobee's developer documentation indicates they are not currently accepting new developer registrations.** This could block a new app from obtaining API credentials at all — needs direct confirmation with Ecobee before committing engineering time. |
| API Maturity | Stable API design, but developer *program* access itself is in question (see limitation above) — flagged as **Unknown — needs further research** on current registration status. |
| Engineering Complexity | Low (if credentials can be obtained). |
| Priority | Medium, contingent entirely on resolving the developer-registration question first — do not commit build-order priority until that's confirmed. |

Sources: [ecobee API — Getting Started](https://www.ecobee.com/home/developer/api/introduction/index.shtml), [ecobee API — PIN Authorization Strategy](https://www.ecobee.com/home/developer/api/documentation/v1/auth/pin-api-authorization.shtml), [GitHub home-assistant/core issue — "Existing Ecobee API key not working any longer" (corroborates registration/access friction)](https://github.com/home-assistant/core/issues/169328).

---

### Nest / Google Nest API (Smart Device Management API)

| Field | Value |
|---|---|
| Integration Method | Official Google Smart Device Management (SDM) API (`smartdevicemanagement.googleapis.com`), trait-based REST model. |
| Local / Cloud | Cloud. |
| Discovery | API lists/enumerates structures, rooms, and devices tied to the user's Google/Nest account — no LAN discovery. |
| Authentication | 3-legged OAuth2 (user authorizes via Google's Partner Connections Manager); additionally requires the developer to register in the **Device Access Console**, which carries a **one-time, non-refundable US$5 registration fee** per developer account. |
| Capabilities | Nest thermostats (mode, setpoint), Nest cameras/doorbells (stream generation, event info), Nest smoke/CO alarms — trait-based, varies by device type. |
| Expo Go | Fully — plain HTTPS/OAuth2 via `fetch`. |
| Dev Build Required | No. |
| Native Module Required | No. |
| Platform Limitations | The $5 developer-registration fee is trivial but is a real, documented one-time friction point (distinguishing it from most other APIs researched, which are free to register for). |
| API Maturity | Stable, official, has client libraries for multiple languages (Python, Go, Java, .NET, PHP). |
| Engineering Complexity | Low. |
| Priority | Medium — solid, stable, well-documented cloud API; reasonable candidate for a later thermostat/camera-category integration, not a first-wave pick since the brief's first four categories (TV, streaming, lighting, robot vacuum) don't include thermostats. |

Sources: [Google for Developers — Smart Device Management API](https://developers.google.com/nest/device-access/api), [Google for Developers — Device Access Registration ($5 fee)](https://developers.google.com/nest/device-access/registration), [Google for Developers — Use the API](https://developers.google.com/nest/device-access/use-the-api).

---

## Robot vacuums

### iRobot / Roomba

| Field | Value |
|---|---|
| Integration Method | **No open/public developer API.** iRobot's own customer-support documentation explicitly states Wi-Fi-connected Roombas do not have an open API. Community control (e.g. `dorita980`, `roombapy`) reverse-engineers iRobot's cloud MQTT protocol to extract a local key, after which some local MQTT control is possible directly against the robot. |
| Local / Cloud | Hybrid — cloud account credentials are needed once to extract a per-robot local MQTT key/certificate; ongoing control can then happen locally over MQTT (TLS) on the LAN. |
| Discovery | mDNS/manual IP for the local MQTT connection, after cloud-based key extraction. |
| Authentication | iRobot cloud account login (to obtain the local robot's password/BLID), then local MQTT-over-TLS using that extracted credential. |
| Capabilities | Start/stop/dock cleaning, status, some mapping/room-targeting on newer models — via reverse-engineered protocol only. |
| Expo Go | No — requires a native MQTT-over-TLS client, not available via Expo Go JS APIs. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — MQTT client library with TLS support. |
| Platform Limitations | None platform-specific, but significant business risk: iRobot's ongoing corporate instability (reported 2025 financial distress and acquisition) makes the already-unofficial protocol's long-term stability even less certain. |
| API Maturity | Closed — explicitly no official API; reverse-engineered only. |
| Engineering Complexity | Medium-High. |
| Priority | Low as a first pick, specifically **because** there's no official API and the vendor's business situation adds extra risk of the reverse-engineered protocol breaking with no recourse. |

Sources: [iRobot Customer Care — "Open API availability for a Wi-Fi connected Roomba"](https://homesupport.irobot.com/app/answers/detail/a_id/9840/~/open-api-availability-for-a-wi-fi-connected-roomba.) (confirms no open API), [koalazak/dorita980 (community reverse-engineered library)](https://github.com/koalazak/dorita980), [iRobot — "iRobot is Here to Stay" company update](https://www.irobot.com/en_US/here-to-stay-company-update.html).

---

### Roborock (local API / cloud)

| Field | Value |
|---|---|
| Integration Method | Roborock devices (built on the Xiaomi/Tuya-adjacent "miIO" local protocol lineage) support a **local UDP/TCP protocol** (historically port 54321 for miIO-based control, referenced local port 58867 in some newer documentation) once a per-device local key/token is obtained; a cloud API also exists but community consensus (including active Home Assistant integration discussion) is that the cloud API is rate-limited and local control is preferred where the token can be extracted. |
| Local / Cloud | Local preferred, once the token is extracted; cloud is the fallback/initial-setup path (and required to obtain the token in the first place). |
| Discovery | Manual IP typically, after obtaining the device ID/token via a one-time cloud-account lookup. |
| Authentication | A per-device local encryption "token" (obtained via the user's Roborock/Xiaomi cloud account, either through official app data extraction or Roborock's own cloud endpoints), then used to encrypt/authenticate local UDP/TCP packets. |
| Capabilities | Start/stop/dock cleaning, room/zone targeting, status, live map data (on models exposing it) — quite comprehensive on newer firmware. |
| Expo Go | No — requires a raw UDP/TCP socket with custom binary/encrypted framing, not available via Expo Go JS APIs. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — a UDP/TCP socket module plus implementation of the miIO-style encryption scheme (no mainstream maintained RN wrapper found; would likely need to port logic from `python-roborock`). |
| Platform Limitations | Some newer models (noted in a live Home Assistant GitHub issue) have been found *unable* to use the local API at all on certain firmware — local-API availability is not guaranteed across the full current product line and should be verified per-model. |
| API Maturity | Experimental/community — no official Roborock developer program or public API documentation was found; everything here is reverse-engineered, actively maintained by the community (`python-roborock`), but with known model/firmware gaps. |
| Engineering Complexity | Medium-High. |
| Priority | Medium — among the more mature community robot-vacuum protocols researched (active library maintenance, real local-control option), but the firmware-dependent local-API gaps are a real risk factor to validate against Sean's actual target hardware before committing. |

Sources: [Python-roborock/python-roborock (actively maintained community library)](https://github.com/Python-roborock/python-roborock), [python-roborock docs — API commands](https://python-roborock.readthedocs.io/en/latest/api_commands.html), [Home Assistant GitHub issue — "Roborock Saros 10 unable to use local API" (confirms model-dependent gaps)](https://github.com/home-assistant/core/issues/152159).

---

### Ecovacs / Deebot

| Field | Value |
|---|---|
| Integration Method | No official public developer API. Ecovacs devices use either XMPP or MQTT (model-dependent, mutually exclusive per device) against Ecovacs's cloud (`mq-<countrycode>.ecovacs.com`); community projects (`Bumper`, `ecovacs-deebot`) reverse-engineer this to enable local control, sometimes by standing up a local MQTT broker (`Bumper`) that impersonates Ecovacs's cloud so the robot and app both connect locally instead of over the internet. |
| Local / Cloud | Cloud by default; local control is possible only via a community-run local-broker workaround (`Bumper`) that intercepts the robot's cloud connection at the network level (e.g. DNS override), which is a fairly invasive setup. |
| Discovery | Cloud-account-based device listing; local broker approach requires network-level DNS/routing changes on the user's LAN. |
| Authentication | Ecovacs cloud account login (for the standard path); the `Bumper` local-broker approach avoids ongoing cloud dependency but requires nontrivial one-time network configuration. |
| Capabilities | Start/stop/dock cleaning, zone cleaning, status, mapping on supported models. |
| Expo Go | No — requires an XMPP or MQTT client (protocol varies by model) plus, for true local control, a self-hosted broker/DNS-override setup that is well outside what a mobile app itself can manage. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — XMPP or MQTT client, and the model-dependent protocol split adds real complexity (two protocols to support depending on hardware generation). |
| Platform Limitations | None platform-specific, but the local-control story requires infrastructure (a self-hosted broker) beyond just the mobile app — a materially heavier lift than other ecosystems for true local operation. |
| API Maturity | Closed officially; community protocol support exists and is actively maintained but is explicitly described by its own maintainers as reverse-engineered. |
| Engineering Complexity | High. |
| Priority | Low-Medium — technically possible but the split XMPP/MQTT protocol plus the local-broker requirement for true local control makes this a heavier lift than Roborock for comparable payoff. |

Sources: [Bumper Docs — How It Works](https://bumper.readthedocs.io/en/latest/How_It_Works/), [mrbungle64/ioBroker.ecovacs-deebot](https://github.com/mrbungle64/ioBroker.ecovacs-deebot), [kushagharahi/ecovacs-privacy-control](https://github.com/kushagharahi/ecovacs-privacy-control).

---

### Shark (SharkClean app)

| Field | Value |
|---|---|
| Integration Method | **No public API of any kind from SharkNinja.** Community library (`sharkiq`) works by reverse-engineering the fact that Shark's backend runs on **Ayla Networks'** generic IoT device-cloud platform, and calls Ayla's device API directly using Shark-specific app credentials (`app_id`/`app_secret`) extracted from the SharkClean app. |
| Local / Cloud | Cloud only (Ayla Networks' platform) — no local control path was found or appears to exist for Shark robots. |
| Discovery | Cloud-account device listing via the Ayla API. |
| Authentication | Ayla Networks cloud account login (the user's SharkClean account credentials), plus Shark's app-specific `app_id`/`app_secret` (extracted by the community, not published by Shark or Ayla for third-party use). |
| Capabilities | Start/stop/dock cleaning, basic status — a fairly thin control surface compared to Roborock. |
| Expo Go | Partially at best — the underlying calls are HTTPS (Ayla's API), so technically callable via `fetch`, but relying on extracted/unpublished `app_id`/`app_secret` values is fragile and could be revoked or changed by SharkNinja/Ayla without notice, and there's a legitimate question of whether shipping those extracted credentials in a public app is appropriate. |
| Dev Build Required | No, technically (it's HTTPS), but see the credential/legitimacy caveat above. |
| Native Module Required | No. |
| Platform Limitations | None technical; the real limitation is legal/legitimacy and durability of using unpublished third-party (Ayla) app credentials. |
| API Maturity | Closed — no official API; unofficial community reverse-engineering of a third-party IoT backend (Ayla), which is a step further removed from the vendor than most other entries in this document. |
| Engineering Complexity | Medium (technically simple HTTPS calls, but built on a fragile, unofficial foundation). |
| Priority | Low. Given no official API and reliance on extracted third-party platform credentials, this should not be a priority build target; flag to Sean as a "possible later community-style integration with real fragility/legitimacy caveats" rather than a supported feature. |

Sources: [ajmarks/sharkiq (GitHub)](https://github.com/ajmarks/sharkiq), [TheLastFrame/sharkiq-new — unofficial SDK](https://github.com/TheLastFrame/sharkiq-new), [sharkiq API documentation (community-hosted)](https://sharkiqlibs.github.io/sharkiq/).

---

### Eufy (Anker)

| Field | Value |
|---|---|
| Integration Method | No official public API. Eufy robot vacuums run on the **Tuya** IoT platform/protocol under the hood; community libraries speak Tuya's local protocol (v3.3) directly to the robot over TCP port 6668 once a per-device local key is obtained. |
| Local / Cloud | Local, once set up — cloud (Eufy/Tuya account) is used only for the initial one-time retrieval of the device ID and local key; after that, the key can be used for ongoing local control, though the key can rotate and require a fresh cloud fetch. |
| Discovery | Manual IP typically, paired with the cloud-obtained device ID/local key. |
| Authentication | AES-encrypted Tuya local protocol using the extracted local key; initial key retrieval requires Eufy cloud account login. |
| Capabilities | Start/stop/dock cleaning, status, similar to other Tuya-based vacuums. |
| Expo Go | No — requires a raw TCP socket plus AES encryption/decryption of the Tuya protocol frames, not available via Expo Go JS APIs. |
| Dev Build Required | Yes. |
| Native Module Required | Yes — TCP socket module plus a Tuya-protocol (v3.3) implementation (portable from existing open-source Node.js/Python implementations, but still native/bespoke work in an RN context). |
| Platform Limitations | None platform-specific. |
| API Maturity | Closed officially; community Tuya-protocol implementations are mature and well-understood (Tuya's local protocol is one of the most widely reverse-engineered IoT protocols in the ecosystem, benefiting from work done across many Tuya-based brands, not just Eufy). |
| Engineering Complexity | Medium — the underlying Tuya local protocol is one of the better-understood reverse-engineered IoT protocols, which lowers risk relative to Shark/Ecovacs/Narwal. |
| Priority | Medium-High — a reasonable second robot-vacuum integration precisely because the Tuya protocol's broad reuse across brands (Eufy and others) means the engineering investment in a "Tuya local-protocol driver" pays off across multiple vendors at once, which is well-aligned with the manufacturer-agnostic-abstraction goal. |

Sources: [dmdboi/eufy-robot-vac-sdk](https://github.com/dmdboi/eufy-robot-vac-sdk), [8none1/eufy-x8 — Home Assistant integration via Tuya v3.3 local protocol](https://github.com/8none1/eufy-x8), [Eufy X8 local control write-up](https://www.whizzy.org/2026-05-16-eufy-x8-home-assistant/).

---

### Dreame

| Field | Value |
|---|---|
| Integration Method | Dreame offers a cloud API ("Dreame Home" cloud) used by community Home Assistant/Homebridge integrations; some models also support direct local-IP connection (similar Xiaomi/miIO lineage to Roborock, as Dreame originated as a Xiaomi ecosystem partner) as an alternative to the cloud path. Separately, Dreame has begun shipping **Matter** support on some newer models, enabling fully local, vendor-cloud-free control through a Matter controller. |
| Local / Cloud | Mixed — cloud API is the more broadly documented/supported path; direct local-IP control exists for some models (miIO-lineage); Matter (where supported) is fully local with no Dreame cloud involvement at all. |
| Discovery | Cloud-account device listing for the cloud path; manual IP for local miIO-style control; standard Matter commissioning for Matter-enabled models. |
| Authentication | Dreame/Xiaomi cloud account login for the cloud path and to extract a local token for direct-IP control; standard Matter commissioning (setup code) for Matter-enabled models. |
| Capabilities | Start/stop/dock cleaning, zone/room targeting, mapping, status — comprehensive on the cloud path; more limited/model-dependent on the direct local path. |
| Expo Go | No — cloud path still needs a bespoke Dreame protocol client; local miIO-style path needs raw UDP/TCP + encryption, same class of problem as Roborock. |
| Dev Build Required | Yes. |
| Native Module Required | Yes, for cloud or direct-local approaches (custom protocol work); a Matter-based approach on supported models could instead reuse whatever Matter-controller integration (HomeKit/Google Home APIs) the app has already built for the smart-home-platform category, rather than a bespoke Dreame module. |
| Platform Limitations | None specific beyond model-dependent feature/protocol variance. |
| API Maturity | No official public developer API found; community-documented cloud/local protocols, plus an emerging (and more promising) path through the official Matter standard on newer hardware. |
| Engineering Complexity | Medium-High for the bespoke cloud/local paths; potentially Low if targeting only Matter-enabled models through an already-built Matter controller. |
| Priority | Low-Medium as a bespoke integration; worth revisiting specifically as a **Matter** target once Matter-controller support exists in the app, rather than building a one-off Dreame protocol client. |

Sources: [Dreame Home API — Questions&Feedback thread (community, confirms no clean official public API)](https://forum.dreametech.com/forum.php?mod=viewthread&tid=740), [Tasshack/dreame-vacuum — Home Assistant integration](https://github.com/Tasshack/dreame-vacuum), community note on Matter-based local control of a Dreame vacuum ("entirely on the local network with no vendor cloud in the path").

---

### Narwal

| Field | Value |
|---|---|
| Integration Method | **Confirmed no public API — and Narwal was asked and declined to open one**, per a community Home Assistant integration author. That integration instead speaks directly to the robot's own local WebSocket server (port 9002) via full reverse engineering. |
| Local / Cloud | Fully local (the community integration explicitly requires no Narwal cloud account at all). |
| Discovery | Manual IP. |
| Authentication | None documented beyond reaching the robot's local WebSocket port — no token/credential scheme described. |
| Capabilities | Start/stop/dock cleaning, status, zone cleaning per the community integration's feature set. |
| Expo Go | No — raw WebSocket is actually available in Expo Go (`WebSocket` is a JS API), so this is *closer* to feasible than most other robot vacuums, but the protocol is entirely undocumented/reverse-engineered binary-ish framing that changes across firmware generations without notice, per the integration author, and the robot only accepts **one** WebSocket client at a time (a second connection silences the first) — a real architectural constraint if the user also runs the official Narwal app. |
| Dev Build Required | No, technically, for the WebSocket transport itself — but see maturity/risk caveats below, which make this a bad first choice regardless. |
| Native Module Required | No, for the transport; yes-in-spirit for the amount of custom protocol-decoding logic needed, which would need to be written in JS/TS against an unstable, undocumented schema. |
| Platform Limitations | The "one client at a time" limit is a hard architectural constraint — Hearth and the official Narwal app could not both be connected simultaneously. |
| API Maturity | Closed and explicitly refused by the vendor; reverse-engineered protocol is described by its own maintainer as changing schemas across firmware generations without notice. |
| Engineering Complexity | High (protocol instability, not transport difficulty). |
| Priority | Low. Vendor explicitly declined to open an API, the protocol is described as unstable across firmware updates, and there's a single-client limitation — combination of factors makes this one of the weakest robot-vacuum candidates researched despite the technically-simple WebSocket transport. |

Sources: [sjmotew/NarwalIntegration — README (states no public API, vendor declined, local WebSocket port 9002, single-client limit, schema instability across firmware)](https://github.com/sjmotew/NarwalIntegration), [Narwal Home Assistant Integration site](https://sytchi.github.io/NarwalIntegration/).

---

### SwitchBot (includes some robot vacuums)

| Field | Value |
|---|---|
| Integration Method | Official SwitchBot Open API (v1.1), documented and published by SwitchBot/OpenWonderLabs on GitHub. |
| Local / Cloud | Cloud (the Open API routes through SwitchBot's cloud even for devices connected via a local SwitchBot Hub — a Hub is required and "Cloud Services" must be explicitly enabled on it). |
| Discovery | API lists devices already registered to the user's SwitchBot account. |
| Authentication | Token + HMAC-signed request scheme: developer/user generates a Token and Secret from within the SwitchBot app's hidden developer options (tap the app-version label 10 times), then every request is signed using an HMAC of token+timestamp+nonce with the secret. |
| Capabilities | Broad across SwitchBot's own device line (plugs, curtains, locks, sensors, and select robot vacuum models); a real, working example of a manufacturer that both sells robot vacuums and other categories under one official, documented API. |
| Expo Go | Fully — plain HTTPS via `fetch`; the HMAC signing is just string/crypto work doable in pure JS (e.g. via a small HMAC-SHA256 implementation), no native module required. |
| Dev Build Required | No. |
| Native Module Required | No. |
| Platform Limitations | Rate limit of 10,000 calls/day per token — generous for a single-user consumer app, worth tracking if the app were ever to proxy many users through one shared token pool (it shouldn't; each user should use their own token). |
| API Maturity | Stable, official, actively maintained on GitHub with versioned releases (v1.0 and v1.1 documented). |
| Engineering Complexity | Low. |
| Priority | **High — best candidate for first (or second) robot-vacuum integration.** It's the only robot-vacuum-capable ecosystem researched with a genuinely official, documented, stable API and full Expo Go compatibility — a strong contrast to every other robot-vacuum brand researched, all of which required reverse engineering. |

Sources: [OpenWonderLabs/SwitchBotAPI (official GitHub documentation)](https://github.com/OpenWonderLabs/SwitchBotAPI), [SwitchBotAPI — README v1.0](https://github.com/OpenWonderLabs/SwitchBotAPI/blob/main/README-v1.0.md).

---

## Summary table — all ecosystems

| Ecosystem | Classification | Expo Go | Priority |
|---|---|---|---|
| Sony (Bravia/Android TV) | 🟢 GREEN | Fully (control); dev build for discovery | Very High |
| Roku (TV + streaming) | 🟢 GREEN | Fully (control); dev build for discovery | Very High |
| Philips Hue | 🟢 GREEN | Fully | Very High |
| SwitchBot | 🟢 GREEN | Fully | High |
| Samsung (Tizen, remote control) | 🟡 YELLOW | Partially (WebSocket works; discovery needs dev build) | High |
| LG (webOS) | 🟡 YELLOW | Partially (WebSocket works; discovery needs dev build) | High |
| Home Assistant | 🟢 GREEN | Fully | High |
| SmartThings | 🟢 GREEN | Fully | High |
| Eufy (Anker, Tuya protocol) | 🟡 YELLOW | No (native TCP + encryption) | Medium-High |
| Chromecast (Google Cast SDK) | 🟡 YELLOW | No (native SDK required) | Medium-High |
| Vizio (SmartCast) | 🟡 YELLOW | Partially (TLS friction; discovery needs dev build) | Medium |
| Sonos | 🟡 YELLOW | Fully (cloud API); partial (legacy local) | Medium |
| Denon/Marantz (HEOS/Telnet) | 🟡 YELLOW | No (raw TCP) | Medium |
| Roborock | 🟡 YELLOW | No (raw UDP/TCP + encryption); model-dependent local-API gaps | Medium |
| Nest / Google Device Access | 🟡 YELLOW | Fully | Medium |
| Ecobee | 🟡 YELLOW (pending registration-access question) | Fully | Medium |
| Google Home APIs | 🟡 YELLOW | No (native SDK, beta, Android-first) | Medium |
| Matter | 🟡 YELLOW | No (native SDK; best reached via HomeKit/Google Home APIs) | Medium-Low |
| Dreame | 🟡 YELLOW | No | Low-Medium |
| Ecovacs/Deebot | 🔴 RED | No | Low-Medium |
| TCL | 🔴 RED | No (requires ADB + Developer Options) | Low |
| Fire TV | 🔴 RED | No (requires ADB + Developer Options) | Low |
| Google TV/Android TV | 🔴 RED | No (requires ADB or private protocol) | Low |
| iRobot/Roomba | 🔴 RED | No | Low |
| Shark | 🔴 RED | Partially (fragile, unofficial credentials) | Low |
| Narwal | 🔴 RED | No (transport is fine; protocol is unstable and vendor-refused) | Low |
| Apple HomeKit | 🔴 RED (iOS-only, no Android path) | No | Low (for cross-platform goal) |
| Hisense (VIDAA) | 🔴 RED | No (mTLS certificate problem) | Low |
| Apple TV/tvOS | 🔴 RED | No | Low |
| Amazon Alexa (Smart Home Skill/AVS) | 🔴 RED (wrong direction of integration) | N/A | Do not build |
| Apple HomePod | 🔴 RED (no control API exists) | N/A | Do not build |

---

## Recommended MVP integrations

Favoring local-first control, mature/stable public APIs, and low auth friction — and explicitly *not* picking a brand just because it's the most popular one:

- **TV: Sony (Bravia REST API).** The only TV vendor researched with a fully official, vendor-documented, vendor-supported REST API. Local, plain HTTP (works in Expo Go for control), simple pre-shared-key auth. Samsung and LG are close seconds and are the recommended **pair** for proving the manufacturer-agnostic driver abstraction within the TV category once Sony is working, since both use a strikingly similar local-WebSocket-plus-on-screen-pairing pattern with just enough protocol difference (JSON schema, port/handshake details) to be a genuine abstraction test — without the TLS headaches of Vizio or the Developer-Mode/ADB and certificate problems of TCL and Hisense.

- **Streaming device: Roku.** Fully official ECP REST API, no authentication friction at all, works in Expo Go for control, and — uniquely among the streaming devices researched — the exact same protocol also covers Roku TVs, so this one integration effort pays off in two categories simultaneously. Chromecast (via `react-native-google-cast`) is a strong complementary pick for "cast content" as a second streaming capability, since it is officially supported and well-maintained, but it solves a different problem (media casting, not general remote control) and requires a dev build.

- **Lighting/smart-home platform: Philips Hue.** The strongest API researched across every category in this document: fully official, fully local, physical-button pairing (secure and simple), and the only ecosystem researched that works completely in Expo Go — control and discovery — with zero native modules required. This should also be the reference implementation the driver-abstraction interface is designed against first, since it's the cleanest possible case.

- **Robot vacuum: SwitchBot.** The only robot-vacuum-capable ecosystem with a genuinely official, published, versioned API (OpenWonderLabs/SwitchBotAPI) rather than reverse engineering. Fully local-network-capable via a SwitchBot Hub, works entirely in Expo Go, and has a clear, documented HMAC auth scheme. Every other robot-vacuum brand researched (iRobot, Roborock, Ecovacs, Shark, Eufy, Dreame, Narwal) requires reverse-engineered protocols with meaningfully higher engineering risk and, in Narwal's case, an explicit vendor refusal to support third-party access — SwitchBot is the only low-risk entry point into this category. Once the driver abstraction is proven there, **Eufy (Tuya local protocol)** is the recommended second robot-vacuum integration, since the underlying Tuya local protocol is shared across many vacuum brands, making it a high-leverage second data point for the abstraction.

