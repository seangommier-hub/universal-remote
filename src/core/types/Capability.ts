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
  //  - Roku: NOT declared as a standalone toggle as of 2026-09-20 (ADR-HEARTH-116) — folded into
  //    "selectPlayPause" below, per Sean's explicit, informed decision to accept that ADR-HEARTH-
  //    068's Netflix-PIN/YouTube-Skip-Ad regression. Official ECP docs (developer.roku.com) still
  //    document GET /query/media-player returning <player state="play|pause|...">, and the "Play"
  //    remote key still toggles play<->pause on its own hardware remote — no separate Pause key
  //    exists because none is needed. RokuEcpDriver.ts.
  //  - LG webOS: NOT declared as a standalone toggle as of 2026-09-20 — see "selectPlayPause"
  //    below for why LG folds this into "select" instead. `ssap://com.webos.media/getForegroundAppInfo`
  //    (hobbyquaker/lgtv2) still supplies the live `playState` field used to drive that merged
  //    button's icon — same "best-effort, degrade to undefined rather than crash" treatment as
  //    this driver's other inferred fields, since that source itself notes the endpoint 404s on
  //    some older webOS firmware. LgWebOsDriver.ts.
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
  | "playPause"
  // Sean, directly (2026-09-20), about his own real LG TV's included Magic Remote: "the lg remote
  // does all 3 with the scroll function button in the middle of the remote" — select, play, and
  // pause via that one physical OK/wheel-click button. Deep research (codebase + Roku/LG SSAP
  // docs + Apple TV/Google TV/Fire TV hardware) confirmed this is real for LG specifically:
  //  - LG's real Magic Remote has no separate physical play/pause button at all for this
  //    interaction — the same OK/wheel-click press that LgWebOsDriver.ts's "select" case already
  //    sends as the literal `ENTER` button code (hobbyquaker/lgtv2) is the exact press Sean's real
  //    remote uses for play/pause too. The ambiguity that broke Roku (Netflix's PIN lock, YouTube's
  //    Skip Ad — see below) is resolved on real LG hardware by webOS's own on-device focus/UI state
  //    at the instant of the press — the same mechanism Apple TV's Siri Remote clickpad and simple
  //    Google TV remotes use (click activates whatever's focused on screen; falls through to
  //    play/pause only when nothing is) — never by the remote or Hearth guessing from a stale
  //    polled `playbackState` snapshot. Sending the same `ENTER` code Hearth already sends for
  //    "select" replicates that real, working, on-device behavior directly. See ADR-HEARTH-114.
  //  - Roku (ADR-HEARTH-116, 2026-09-20): unlike LG, no such on-device disambiguation exists —
  //    Roku's own developer docs treat "Select" and "Play" as genuinely separate ECP keys with no
  //    device-side focus signal exposed to any client, and ADR-HEARTH-068's research (three
  //    parallel agents, corroborated by Home Assistant's mature Roku integration hitting the
  //    identical unsolved ambiguity) confirmed this is a real, unsolved industry-wide gap, not an
  //    oversight in this driver. Shown a real Samsung remote confirming the same physical-button
  //    split exists there too, and shown the specific reintroduced regression this would cause
  //    (Netflix's PIN lock, YouTube's Skip Ad both broke the last time this was tried), Sean
  //    explicitly chose uniform one-button behavior across every driver over avoiding those two
  //    edge cases: "2" — merge everywhere, accept the Roku regression. `RokuEcpDriver.ts`'s merged
  //    case sends `Play` (the real toggle key) whenever `playbackState` reads confidently
  //    playing/paused, else falls back to `Select` — the original, pre-ADR-HEARTH-068 design,
  //    reinstated knowingly rather than by accident.
  //  - Samsung, Sony: unaffected — neither declares `playPause` at all (existing, unrelated gap;
  //    see this file's own `playPause` entry above), so there's nothing to merge yet.
  // See ADR-HEARTH-114 (LG) and ADR-HEARTH-116 (Roku) for the full decision records.
  | "selectPlayPause"
  // Real-hardware research (2026-09-16): "so the user can type usernames and passwords rather
  // than having to navigate to each letter on screen" -- verified per-brand from primary/official
  // sources before adding, not assumed:
  //  - Roku: real and declared. Official ECP docs document `POST /keypress/Lit_<char>` -- sends
  //    one literal printable character to whichever on-screen field currently has focus. No
  //    single-shot "insert this whole string" call exists; a full string is sent as a sequence of
  //    per-character requests (RokuEcpDriver.ts, sendCharacterSequence.ts) -- the same pattern
  //    this driver already uses for setChannel's digit entry.
  //  - LG webOS: real and declared, sourced from LG's own official "Connect SDK" (2014, LG
  //    Electronics), adopted verbatim by the openHAB LG webOS binding
  //    (LGWebOSTVKeyboardInput.java) -- `ssap://com.webos.service.ime/insertText` takes the
  //    entire string in one request (`{text, replace: 0}`), a strictly better mechanism than
  //    Roku's per-character one. LgWebOsDriver.ts.
  //  - Samsung Tizen: NOT declared. The unencrypted remote-control WebSocket this driver is
  //    restricted to (ADR-HEARTH-005) is documented key-press emulation only (see this file's own
  //    playPause comment for the same protocol-scope finding) -- no IME/text-injection service
  //    exists on this channel in any source checked.
  //  - Sony BRAVIA: NOT declared. IRCC-IP (this project's newly-added Sony capability set, see
  //    ADR-HEARTH-071) only ever sends discrete named remote-button codes (Up/Down/Confirm/
  //    Num0-9/etc.) -- no literal-character or string-insertion code exists in either primary
  //    source this project's IRCC-IP codes were verified against.
  | "textEntry"
  // Squirrel feeder integration (2026-09-20, ADR-HEARTH-104): a single fire-and-forget manual
  // dispense request, sourced from that project's own real ESP32 HTTP API — POST /dispense (see
  // squirrel-feeder/src/network.cpp's handleDispense) either queues a dispense or returns HTTP
  // 429 "feeder busy" when the gate isn't idle. No args, and unlike every other capability here,
  // no persistent on/off value this toggles — SquirrelFeederDriver.ts.
  | "dispense";

/** Streaming services the launchApp capability can target — each driver maps these to its own protocol's real app/channel id. */
export type StreamingService = "netflix" | "hulu" | "primeVideo" | "youtube";

/** Directions supported by the directionalNavigation capability. */
export type NavigationDirection = "up" | "down" | "left" | "right";
