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

## Update 2026-09-12 (later, live hardware testing): LG's real firmware 404s the subscription — a polling fallback was tried, then reverted the same night

Live-tested against Sean's actual TV (a 2020 LG 75UN7370PUE, webOS ~5.0) via a newly-built Android
emulator — the caveat this ADR's "Consequences" section already flagged as unconfirmed turned out
to be real: `ssap://com.webos.media/getForegroundAppInfo` 404s on this exact firmware, confirmed
live, not inferred.

Rather than stop there, tried a fallback: polling the older
`ssap://com.webos.applicationManager/getForegroundAppInfo` (confirmed live to work on this
firmware) every 8s, treating a known streaming app being foregrounded as `"playing"`. Implemented,
shipped, and live-verified to correctly show a pause icon when YouTube was foregrounded.

**Reverted the same night, per Sean directly**: "the play pause center button should only be during
the time content is playing but should be a selection button otherwise. in the current state
nothing can be selected." Real bug: this endpoint only reports which app is in the foreground, with
no actual playback-state field — treating "app is open" as "playing" is wrong for the entire time a
user is just browsing that app's own menus, not watching anything, which on a real TV is most of the
time a streaming app is open. That wrongness hid the Select button — the far more frequently needed
of the two functions — almost permanently, a strictly worse outcome than the honest gap this ADR's
own "Consequences" section had already accepted for firmware without the real subscription.

No reliable middle ground exists with only an app-id signal available (no timing heuristic, no
secondary signal, changes this) — removed the polling fallback entirely
(`PLAYBACK_POLL_INTERVAL_MS`, `startPlaybackPolling`, `playbackPollTimers`, and the `onError` wiring
into `client.subscribe()`) rather than trying to tune it. `playbackState` is unset when the real
subscription fails, restoring this ADR's original, correct default: Select always shown. Play/pause
genuinely isn't available on this firmware — the original finding stands, uncorrected by a
well-intentioned but wrong workaround.

`client.subscribe()`'s optional `onError` third parameter (added for this fallback) was left in
place — a generically useful capability for a future caller, not dead code specific to the reverted
feature, since nothing about it assumes what the caller does on failure.

All 259 tests pass after the revert (`LgWebOsDriver.test.ts`'s existing subscription-failure test
already only asserted `connect()` succeeds regardless, not polling behavior — nothing needed
updating).

## Update 2026-09-13: Fire TV correction, one more exhaustive live sweep, then a command-history heuristic

Sean, live while actively watching content on the real LG TV, restated the ask in terms that
changed the design target: **"think of an amazon firestick remote, the center button functions for
all three depending on the state of the firestick"** — one dynamic button (Select / Play / Pause),
not the separate always-visible Play and Pause buttons this session had proposed and briefly
implemented in `Capability.ts` (reverted immediately, same session, back to the single `"playPause"`
id from the original 2026-09-12 decision above).

Before assuming the 2026-09-12 firmware-404 finding was final, ran one more exhaustive live sweep
against Sean's real TV while he confirmed he was actively watching (`lg_playstate_probe2.js`,
scratchpad-only, query-only calls — never touched playback): `media.controls/getStatus`,
`com.webos.media/getStatus`, `com.webos.media/getForegroundAppInfo` (still 404),
`com.webos.applicationManager/getAppState`, `com.webos.service.mediacontroller/getStatus`,
`audio/getStatus`, `tv/getCurrentChannel` — none of these return a playback-state field on this
firmware; only `com.webos.applicationManager/getForegroundAppInfo` (appId only, already known)
succeeded. Confirms the 2026-09-12 finding was not incomplete: **this TV's firmware genuinely
exposes no true playback-state signal, full stop.**

Asked Sean directly what tradeoff he'd accept given that hard constraint (three options: accept the
appId-foregrounding heuristic already reverted once, accept no dynamic button at all, or something
else). He didn't pick one of the three — he restated the ideal instead: **"it should allow the user
to select things then rotate to play/pause when content is playing 3 functions of the button but
dynamic and adjusting based on the thing that is happening. select when content isn't playing and
then play."** Read together with the Fire TV framing, the actual requirement is: derive "is content
playing" from *something* real, and default to Select whenever that's unknown — never guess
"playing" without a real trigger, which is exactly what the reverted appId-polling approach got
wrong (foregrounding a streaming app is not the same as playing something inside it).

### Decision: command-history-derived approximation, not device telemetry

Since no telemetry signal exists at all on this firmware, the driver instead tracks its own command
history per device (`assumedInStreamingApp: Map<string, boolean>` in `LgWebOsDriver.ts`) as a
best-effort proxy for "is a video plausibly playing right now":

- `launchApp` (opening Netflix/Hulu/etc.) sets the flag `true`, but leaves `playbackState:
  "stopped"` — landing in an app is landing on its browse screen, not mid-video, so the center
  button stays on Select immediately after launch. This is the specific case Sean's restated ask
  called out by name ("select when content isn't playing").
- `select` (the center button itself, i.e. the user picking something in that app's UI) is the only
  transition that flips to `"playing"`, and only if the flag is `true` — pressing OK/Enter inside a
  streaming app is the real user action that starts playback, so it's the most honest available
  trigger given no device-side confirmation exists. Pressing select with no streaming app open (live
  TV, settings, home) does nothing to `playbackState`, matching pre-2026-09-12 behavior exactly.
- `home` and `inputSelection` (switching to a live-TV input or leaving the app) both clear the flag
  and reset `playbackState` to `"stopped"` — leaving the app is assumed to leave playback, returning
  the center button to Select.
- `disconnect()` clears the per-device flag entirely, so a fresh connection never inherits stale
  assumed state.

This is explicitly an approximation, not a detection: it cannot know if the user backs out to the
app's menu without pressing Home, or pauses via the TV's own physical remote — in both cases the
button will keep showing Pause until the user presses Home/switches input or the driver
reconnects. That's a known, accepted gap, not a bug — there is no signal on this firmware that could
close it, and it strictly dominates both prior states (no dynamic button at all, or the reverted
appId-heuristic that showed Pause for the entire time a user merely browsed an app's menus).

### Testing

Added a new `describe("command-history playback approximation (real-hardware finding,
2026-09-13)", ...)` block to `LgWebOsDriver.test.ts`: select does nothing before any app launch;
`launchApp` alone leaves `playbackState: "stopped"`; select after `launchApp` flips to `"playing"`;
`home` resets both the flag and `playbackState` back to Select; `inputSelection` resets the same way
`home` does. All 5 pass; full suite remains green (27 suites, 264 tests); `npx tsc --noEmit` clean.

**Live-verified 2026-09-13** via the Android emulator against Sean's real LG TV (Downstairs Living
Room, connected): launching Hulu left the center button on the checkmark (Select) exactly as
designed; pressing Select immediately after flipped it to a filled Pause icon; pressing Home reset
it back to the checkmark. The full Select → Play/Pause → Select cycle Sean asked for, modeled on the
Fire TV remote, is confirmed working end-to-end against real hardware, not just in unit tests.

## Update 2026-09-13 (later, same day): the first Select after launch is a profile picker, not a title — real bug, fixed

Sean, directly, after using it: "the logic for the select play/pause button doesn't work because
often times a user needs to be selected when loading the app." Real, concrete bug in the
command-history heuristic above: it flipped to `"playing"` on the very first Select press after
`launchApp`, but that first press is overwhelmingly a "Who's watching?" profile picker in every
major streaming app (Netflix, Hulu, Prime Video, YouTube's account switcher) — not a title. The
center button was flipping to Pause while the user was still picking their profile, well before
anything was actually playing.

**Fix**: `LgWebOsDriver.ts` gained `selectPressesSinceLaunch: Map<string, number>`, counting Select
presses since the last `launchApp` (reset to 0 by `launchApp`/`home`/`inputSelection`, the same
three commands that already reset `assumedInStreamingApp`). Only the **second** Select press
onward flips `playbackState` to `"playing"` — the first stays on Select, matching the profile-pick
step every one of these apps puts first. Still an approximation, still carries this ADR's existing
honest caveats (a show's detail page, a "next episode" prompt, or an app needing a third/fourth
select before real playback all remain unhandled edge cases) — but it now correctly handles the
specific, concrete failure Sean hit rather than guessing wrong on literally the first interaction
every time.

**Testing**: `LgWebOsDriver.test.ts`'s command-history block updated — the old single-select test
split into "first select stays on Select" and "second select flips to playing," and both the
home-reset and inputSelection-reset tests now press Select twice (profile pick + title) to reach
`"playing"` before asserting the reset, matching the real two-step flow. 27 suites / 265 tests pass;
`npx tsc --noEmit` clean.
