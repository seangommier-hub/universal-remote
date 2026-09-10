/** Universal capability identifiers a device can expose. Extend this union as new device categories are implemented — do not add an id until a driver or the UI actually uses it. */
export type CapabilityId =
  | "power"
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
  | "setColor";

/** Streaming services the launchApp capability can target — each driver maps these to its own protocol's real app/channel id. */
export type StreamingService = "netflix" | "hulu" | "primeVideo" | "youtube";

/** Directions supported by the directionalNavigation capability. */
export type NavigationDirection = "up" | "down" | "left" | "right";
