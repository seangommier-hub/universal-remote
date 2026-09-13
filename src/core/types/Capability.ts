/** Universal capability identifiers a device can expose. Extend this union as new device categories are implemented — do not add an id until a driver or the UI actually uses it. */
export type CapabilityId =
  | "power"
  // Real-hardware research (2026-09-13, ADR-HEARTH-064): declared standalone (not paired with
  // "power") specifically for XboxDriver.ts — Xbox's SmartGlass protocol has a genuine, documented,
  // unauthenticated power-ON packet, but no equivalent for power-off/state query without a full
  // encrypted session this driver doesn't implement. A device that can only ever be turned on, not
  // toggled or queried, needs its own capability rather than borrowing "power" and lying about the
  // other half of what that implies.
  | "powerOn"
  | "powerOff"
  | "volumeUp"
  | "volumeDown"
  | "setVolume"
  | "mute"
  | "channelUp"
  | "channelDown"
  | "setChannel"
  | "directionalNavigation"
  | "select"
  | "back"
  | "home"
  | "menu"
  | "inputSelection"
  // Real-hardware research (2026-09-10): verified against each protocol's own documented key/API
  // list before adding these, not assumed. Samsung's Tizen remote-control protocol has a real,
  // documented KEY_SLEEP ("SleepTimer") and KEY_TOOLS (opens the TV's quick-settings panel) — see
  // SamsungTizenDriver.ts. LG's public SSAP pairing manifest explicitly excludes "picture
  // settings, energy saving, …" from what it can reach (confirmed against hobbyquaker/lgtv2, the
  // reference implementation already cited elsewhere in this codebase), and Roku's official ECP
  // key list has no sleep or settings key at all — neither driver declares these capabilities.
  | "sleepTimer"
  | "settings"
  // Real-hardware research (2026-09-10): Roku's ECP has a documented launch-by-channel-ID
  // endpoint (POST /launch/<id>) and LG's SSAP has ssap://system.launcher/launch — both verified,
  // real mechanisms, not assumed. Samsung's protocol has no app-launch capability at all (its
  // remote-control websocket is key-press emulation only), and Sony's wasn't verified either way
  // — neither driver declares this. See RokuEcpDriver.ts/LgWebOsDriver.ts for the id mappings.
  | "launchApp"
  // Real-hardware research (2026-09-10): Samsung's documented Tizen key list includes
  // "KEY_SOURCE|Source" — opens the TV's own on-screen source picker rather than jumping directly
  // to a named input the way inputSelection's LG/Roku/Sony implementations do. Deliberately a
  // separate capability, not folded into inputSelection, because it's a genuinely different
  // mechanism (open a picker vs. switch to a resolved id) — see ADR-HEARTH-027. Samsung's own
  // directionalNavigation/select already let the user drive the picker once it's open.
  | "openSourceList"
  // Phase 5 — Philips Hue lighting (ADR-HEARTH-032). "power" (already declared above) doubles as
  // the light's on/off toggle, matching how SimulatedTvDriver/SonyBraviaDriver/SamsungTizenDriver
  // already use it. Brightness and color are normalized to universal units (0-100 percentage;
  // 0-360/0-100 HSL-style hue degrees/saturation percentage), not Hue's native 1-254/0-65535
  // scales — each driver converts to its own protocol's units, the same way setVolume/setChannel
  // take plain numbers rather than a protocol-specific encoding.
  | "setBrightness"
  | "setColor"
  // Real-hardware research (2026-09-12, ADR-HEARTH-051): live media-playback state (playing vs.
  // paused) and a play/pause toggle command, verified per-brand rather than assumed for all four
  // driver categories:
  //  - Roku: real and declared. Official ECP docs (developer.roku.com) document GET
  //    /query/media-player returning <player state="play|pause|...">, and the "Play" remote key
  //    is documented to toggle play<->pause on its own hardware remote — no separate Pause key
  //    exists because none is needed. RokuEcpDriver.ts.
  //  - LG webOS: real and declared. hobbyquaker/lgtv2 (this driver's existing primary reference)
  //    documents both `ssap://media.controls/play`/`pause` and a subscribable
  //    `ssap://com.webos.media/getForegroundAppInfo` returning a `playState` field
  //    ("playing"/"paused"/...) pushed live over the same SSAP socket this driver already keeps
  //    open — same "best-effort, degrade to undefined rather than crash" treatment as this
  //    driver's other inferred fields, since that source itself notes the endpoint 404s on some
  //    older webOS firmware. LgWebOsDriver.ts.
  //  - Samsung Tizen: NOT declared. Verified real gap, not an oversight — the unencrypted
  //    remote-control WebSocket this driver is restricted to (ADR-HEARTH-005) is pure key-press
  //    emulation with no query/subscribe mechanism of any kind for anything, playback state
  //    included (confirmed against SamsungTizenDriver.ts's own existing capability comment and
  //    corroborated externally — no community client reads playback state over this same
  //    channel). A real playback-state API only exists via Samsung's separate SmartThings/cloud
  //    stack, out of scope here (ADR-HEARTH-042, and explicitly excluded from this change).
  //  - Sony BRAVIA: NOT declared. `getPlayingContentInfo` (this driver's existing REST surface)
  //    is documented and community-corroborated to return only content metadata (title, source,
  //    uri, duration) — the widely-used `antonioparraga/braviarc` reference client (parity with
  //    this driver's own sourcing standard) never reads a playback-state field from it. A
  //    `stateInfo.state` field has been observed for the special `cast:audio` source only, not
  //    as a general documented mechanism — not a real basis for a universal capability. Sony's
  //    separate IRCC-IP protocol is unimplemented here (see SonyBraviaDriver.ts) and out of scope.
  | "playPause";

/** Streaming services the launchApp capability can target — each driver maps these to its own protocol's real app/channel id. */
export type StreamingService = "netflix" | "hulu" | "primeVideo" | "youtube";

/** Directions supported by the directionalNavigation capability. */
export type NavigationDirection = "up" | "down" | "left" | "right";
