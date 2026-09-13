# ADR-HEARTH-051: Play/Pause d-pad center button — real per-brand playback state, not a guess

**Date:** 2026-09-12
**Status:** Accepted

## Context

Real user request, Sean directly: the d-pad's center button always shows a checkmark and sends
the generic `select` capability (`UniversalTvRemote.tsx`'s `dpadMiddleRow`). He wants that same
button to become a play/pause toggle **while a video is actually playing** — not just whenever a
streaming app happens to be open.

No capability or state field for this existed anywhere (`Capability.ts`, `DeviceState.ts` were
both checked first — confirmed empty). Per this project's own established discipline (every
existing driver — LG, Samsung, Sony, Roku — was built only after confirming the real protocol
against actual hardware/official docs; ADR-HEARTH-004/005/006/007), each of the four device types
was researched individually before writing any code. Two are real and implemented; two are
genuinely not possible within this driver's existing protocol scope and are **not** faked.

## Research findings, per brand

### Roku — real, implemented
Roku's own official ECP docs
(`developer.roku.com/docs/developer-program/debugging/external-control-api.md`, the same
authoritative source `RokuEcpDriver.ts`/ADR-HEARTH-007 are already built against) document:
- `GET /query/media-player` returning `<player state="play">` — a real, queryable playback-state
  attribute.
- The **"Play"** remote key (`POST /keypress/Play`) is documented, on Roku's own
  `remote-control-buttons` reference page, to toggle between pause and resume depending on
  current state — no separate `Pause` key exists because none is needed.

Corroborated (not the primary source, just confirmation) by `python-rokuecp`, a widely-used
community client: its `MediaState` model treats exactly `"play"`/`"pause"` as the two valid
`@state` values and discards anything else.

### LG webOS — real, implemented
`hobbyquaker/lgtv2` — this driver's existing primary reference for every other `ssap://` URI it
uses (ADR-HEARTH-006) — documents both:
- `ssap://media.controls/play` / `.../pause` (separate endpoints, not a single toggle like Roku).
- `ssap://com.webos.media/getForegroundAppInfo`, subscribable (`type: "subscribe"`), pushing a
  `playState` field (`"playing"`/`"paused"`/`"starting"`/`"loaded"`) over the **same already-open
  SSAP socket** this driver keeps connected for everything else — a genuine live push, not
  polling. The same reference explicitly flags this endpoint as **not universal**: "not on every
  firmware (404 on webOS 6.0)." Real corroboration of the firmware gap and the exact response
  shape came from a live openHAB community thread
  (`community.openhab.org/t/detecting-play-pause-state-of-lg-webos-tv/160043`), which confirmed
  the endpoint works on webOS 7.3.0+ and 404s on 6.4.0 and earlier.

### Samsung Tizen — real gap, NOT implemented
`SamsungTizenDriver.ts`'s own existing capability comment already states the unencrypted
remote-control WebSocket this driver is restricted to (ADR-HEARTH-005) is **key-press emulation
only** — no query/subscribe mechanism for anything, playback state included. Verified this wasn't
just an assumption: inspected `ollo69/ha-samsungtv-smart`'s `samsungws.py` (a real, actively
maintained community client for this exact protocol) — confirmed it has **no** media-state query
over this channel either; its app-status calls (`ms.application.get`) report whether an app is
*running*, not whether it's *playing*. A real playback-state API exists only through Samsung's
separate SmartThings/cloud stack, already ruled out of scope for this app (ADR-HEARTH-042) and
explicitly excluded from this change.

### Sony BRAVIA — real gap, NOT implemented
`SonyBraviaDriver.ts`'s existing REST surface includes `getPlayingContentInfo`. Checked whether
its response reliably carries a playback-state field:
- Sony's own API reference is JS-rendered and didn't yield a schema via fetch (same limitation
  this driver's own `ExternalInputStatus` comment already notes for a different field).
- The most-established open-source reference client for this API,
  `antonioparraga/braviarc` (`braviarc.py`'s `get_playing_info()`), parses `programTitle`,
  `title`, `programMediaType`, `dispNum`, `source`, `uri`, `durationSec`, `startDateTime` from
  this exact call — **no state field at all**.
- A `stateInfo.state: "PLAYING"` field has been observed in one community bug report, but only
  for a `cast:audio` source (a Chromecast-audio-specific special case) — not a general, documented
  mechanism for ordinary TV playback.
- Sony's separate IRCC-IP protocol is unimplemented in this codebase (`SonyBraviaDriver.ts`'s own
  header comment, ADR-HEARTH-004) and out of scope here.

No real, reliable mechanism exists within this driver's current REST surface. Not implemented.

## Decision

1. **`Capability.ts`**: added `"playPause"` to `CapabilityId`, with the full per-brand citation
   inline (mirroring how `launchApp`/`openSourceList` document their own research). Declared only
   on `RokuEcpDriver` and `LgWebOsDriver`.
2. **`DeviceState.ts`**: added an exported `PlaybackState = "playing" | "paused" | "stopped"` type
   alias so Roku and LG agree on the same three values. **Not** added as a new typed field on the
   `DeviceState` interface itself — stored at `values.playbackState`, the same loose-bag treatment
   every other capability-specific value already gets (`power`, `volume`, `muted`, `input`, ...).
   `DeviceState.values` is explicitly documented as existing for exactly this reason (its own
   docstring: "since the shape varies by device category"); adding a typed top-level field for one
   capability while every other one stays in `values` would be an inconsistent, unwarranted
   special case for a device-state shape the rest of the codebase already treats uniformly.
3. **Roku (`RokuEcpClient.ts`/`RokuEcpDriver.ts`)**: `getMediaPlayerState()` reads
   `/query/media-player`'s `state` XML attribute (new `extractXmlAttribute` helper, since the
   existing `extractXmlTag` only handles element text, not attributes). `playPause` sends the
   `Play` toggle key then re-reads real state — same `refreshX`-after-command pattern already used
   for `powerOff`. Also read once at `connect()` time (not just after a command), otherwise the UI
   would never show the play/pause button in the first place until one had already been pressed
   via some other path — a dead end. **No periodic/background polling was added** — Roku's ECP has
   no push mechanism, and this driver has no polling loop anywhere else in it either;
   `playbackState` is refreshed only at `connect()` and after a `playPause` press, matching every
   other field's existing update cadence rather than introducing a new architectural pattern. This
   is a deliberate, documented tradeoff: the icon reflects truth the moment you open the remote or
   press the button, but — like every other Roku field here — won't instantly flip if playback
   state changes by some other means (the TV's own remote, a cast) while the screen is already
   open.
4. **LG (`LgWebOsClient.ts`/`LgWebOsDriver.ts`)**: `LgWebOsClient` gained a `subscribe(uri,
   onUpdate)` method (`type: "subscribe"` envelope, persistent pending entry that keeps firing
   `onUpdate` for every pushed message on that id — mirrors hobbyquaker/lgtv2's own
   `callbacks[cid]` table, which is never deleted on receipt the way a plain request's is) and a
   returned `unsubscribe()`. `LgWebOsDriver` opens this subscription on
   `ssap://com.webos.media/getForegroundAppInfo` right after `refreshInputList` in `doConnect`,
   tears it down on `disconnect()`/`onDisconnect`, and treats a subscribe failure (e.g. the
   documented 404 on older firmware) as best-effort — logged, not fatal to `connect()`, same
   `refreshVolumeState`/`refreshInputList` treatment already established for LG's other inferred
   fields. `playPause` picks `ssap://media.controls/play` or `.../pause` based on the last-known
   real state (unlike Roku, there's no single toggle key) and optimistically flips the local value
   for instant feedback, the same reasoning as Samsung's existing `optimisticValuesAfter`.
5. **`UniversalTvRemote.tsx`**: the d-pad center button now checks `has(device, "playPause") &&
   (playbackState === "playing" || playbackState === "paused")` — when true, it renders a
   play/pause icon (Ionicons `"pause"`/`"play"`) and sends `playPause` instead of `select`.
   Otherwise it falls back unchanged to the existing checkmark/`select` button (or the empty
   spacer, for a device with neither). Purely additive: Samsung, Sony, and every LG/Roku moment
   where `playbackState` isn't `"playing"`/`"paused"` (e.g. `"stopped"`, or unset because a
   firmware doesn't support the subscription) behave exactly as before.

## Testing

Driver-level tests only, matching each driver's existing `*.test.ts` pattern (mocked `fetch` for
Roku, `MockWebSocket` for LG) — no UI test was added for `UniversalTvRemote.tsx`'s button-swap
logic, since **no UI component in this codebase has a test today** (`src/ui/**/*.test.*` is
empty); adding a UI testing pattern speculatively for one button is out of scope for this change.

- `RokuEcpDriver.test.ts`: capability declared; `connect()` reads and normalizes real
  `play`/`pause`/other→`stopped` states; `connect()` degrades gracefully if the media-player query
  fails; `playPause` sends the `Play` key and re-reads state in both directions; a failed
  read-back after `playPause` leaves the prior value rather than clobbering it. (Every existing
  test in this file needed updating: `connect()` now issues two fetch calls, not one — the
  device-info read plus the new media-player read — so call-index assertions shifted by one.)
- `LgWebOsClient.test.ts`: `subscribe()` sends a real `"subscribe"` envelope and fires `onUpdate`
  for repeated pushes on the same id (not a one-shot resolve); `unsubscribe()` stops further
  pushes and sends the documented `"unsubscribe"` envelope; unsubscribing after the socket already
  closed doesn't throw; an error response on the subscription id is logged and dropped, not
  thrown; calling `subscribe()` before connecting throws synchronously.
- `LgWebOsDriver.test.ts`: capability declared and subscription opened on connect; a pushed
  `playState` populates live `playbackState`; a second push on the same id proves it's a real
  subscription, not one-shot; unrecognized/empty states collapse to `"stopped"`; `connect()`
  succeeds even when the subscription is rejected outright (simulated firmware-404 case);
  `playPause` sends `play` when state is unknown and `pause` once state is known to be playing.

`npx tsc --noEmit`: clean. `npm test`: 24/24 suites, 224/224 tests passing.

## Consequences

- Samsung and Sony TVs keep the existing checkmark/`select` center button permanently — this is a
  real, verified protocol limitation, not a temporary gap. Revisiting either would require a new
  ADR: for Samsung, adopting the encrypted `wss://8002` path and/or SmartThings (a materially
  different integration, already ruled out once for outlets in ADR-HEARTH-042); for Sony,
  implementing IRCC-IP.
- LG's live subscription is genuinely untested against Sean's real hardware (same honest caveat
  every LG feature in this project carries per ADR-HEARTH-006's update log) — in particular,
  whether his specific TV's webOS version actually supports
  `ssap://com.webos.media/getForegroundAppInfo` is unconfirmed. If it 404s, the center button
  simply stays on Select for LG too, exactly as designed (best-effort degrade, not a crash).
- Roku's playback state is only as fresh as the last `connect()` or `playPause` press — a
  documented, deliberate limitation, not an oversight. If real-hardware use shows this feels
  stale, adding actual interval polling for Roku would be a follow-up ADR (this one deliberately
  didn't invent that new mechanism).
