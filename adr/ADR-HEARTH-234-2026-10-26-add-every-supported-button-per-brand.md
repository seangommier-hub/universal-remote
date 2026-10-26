# ADR-HEARTH-234: Add every button each TV brand's connection actually supports

**Date:** 2026-10-26
**Status:** Implemented.

## Context

Sean asked why the remote looks different across his TVs (LG, Samsung, Roku, Sony, Android TV,
Xbox). Answer: each remote only shows the buttons that device's own protocol can genuinely
perform — a dead button would be worse than a missing one (ADR-HEARTH-133, ADR-HEARTH-205's
per-driver `getCapabilities()` pattern). Shown that research, Sean's instruction was direct:

> "just add as many as possible per remote even if they are slightly different"

This is an instruction to widen each driver's real, verified capability set — not to fake buttons
no protocol backs, and not to force every remote to the same fixed layout (that was explicitly
offered as an alternative and not chosen).

## What was researched and added, per driver

Every addition below is a real, documented command this driver's protocol already has a working
connection for — verified against primary/official sources, or (Sony) the same two-independent-
source standard SonyIrccClient.ts's existing code already uses. Nothing here is guessed.

### Roku (`RokuEcpDriver.ts`)
Source: developer.roku.com's External Control Protocol docs, "Recognized by ECP" key list
(fetched 2026-10-26).
- `rewind` → `Rev`, `fastForward` → `Fwd` (documented ECP keys, not available before).
- `menu` → `Info` (the physical remote's `*` button; opens the on-screen options menu for
  whatever's showing). Corrects the earlier "no confirmed menu key" finding — `Info` IS it.

### Samsung (`SamsungTizenDriver.ts`, `SamsungTizenClient.ts`)
Source: xchwarze/samsung-tv-ws-api's `COMMANDS.md` key list and `remote.py`'s `run_app()`
(fetched 2026-10-26) — the same community reference this driver's existing `KEY_TOOLS`/`KEY_SLEEP`
research already cited.
- `play`/`pause`/`rewind`/`fastForward` → `KEY_PLAY`/`KEY_PAUSE`/`KEY_REWIND`/`KEY_FF`.
- `launchApp` → `ms.channel.emit` / `ed.apps.launch`, over the **same** `samsung.remote.control`
  socket every other key already uses (no new connection, no cloud API). **Corrects the earlier
  Capability.ts finding** ("Samsung's protocol has no app-launch capability at all") — that was
  wrong; the mechanism exists, it just isn't a `KEY_*` press. App ids (`SAMSUNG_APP_IDS`) are
  community-sourced (jaruba/ha-samsungtv-tizen, tavicu/homebridge-samsung-tizen), not a
  Samsung-published table, so they can drift by model year — same caveat as Roku's/LG's own
  streaming-service id tables already carry.

### Sony (`SonyIrccClient.ts`, `SonyBraviaCommandMapping.ts`, `SonyBraviaDriver.ts`, new
`SonyAppLauncher.ts`)
Sources: the same two already cited in `SonyIrccClient.ts` (a real KD55XH9296BU
`getRemoteControllerInfo` dump, and `AlecJDavidson/sony_bravia_api`'s `iirc_codes.py`), refetched
2026-10-26 and confirmed byte-for-byte identical on every new code added — this driver's own
documented standard for trusting an IRCC-IP code.
- `channelUp`/`channelDown`, `setChannel` (one `Num0`-`Num9` IRCC code per digit, via
  `sendDigitSequence` — the same helper Roku/Samsung's digit entry already uses).
- `play`/`pause`/`rewind`/`fastForward`.
- `openSourceList` → the `Input` IRCC code (opens Sony's on-screen input picker — the same
  "open a picker, don't resolve directly" shape as Samsung's existing `openSourceList`,
  ADR-HEARTH-027).
- `launchApp` → REST `appControl.getApplicationList` / `setActiveApp` (a separate Sony REST
  service from the `system`/`audio`/`avContent` ones this driver already calls; matched by
  installed app title, since uri values differ by model/region — new `SonyAppLauncher.ts`,
  kept separate per ADR-GLOBAL-003 rather than folded into the command-mapping switch).
- One code (`Options`) that appeared in the device dump but not the second source was **left
  out** — same "both sources must agree" bar as everything already in this file.

### Android TV (`androidTvKeys.ts`)
Source: the Pi's own bridge, `scripts/androidtv/androidtv_bridge.py`'s `ALLOWED_KEYS` and
`src/lib/hearth/androidtv-command-policy.ts`'s `ANDROID_TV_KEYS` (checked directly over SSH,
2026-10-26) — not a third-party library this time, since this bridge is Sean's own code.
- `menu` → `MENU`, `channelUp`/`channelDown` → `CHANNEL_UP`/`CHANNEL_DOWN`. All three were
  **already allowlisted on the Pi** and simply never wired up on the Hearth side — no Pi-side
  change needed. Channel keys act on the TV's tuner/live-TV app; a pure streamer ignores the
  press, same as pressing a numbered key on a universal remote never paired to that function.

### Xbox
Not touched. `XboxDriver.ts`'s own comment is unchanged: SmartGlass's only unauthenticated,
documented command is power-on. Nothing else is real without a full Microsoft session this
driver doesn't implement — adding more here would be the "lying about the other half of what a
capability implies" problem `powerOn`'s own doc comment already warns against (Capability.ts).

## UI

New `TransportControlsRow.tsx`: one small row of rewind/play/pause/fast-forward buttons, each
gated on `has(device, <capability>)` exactly like every other row on this screen — added once for
Roku, Samsung and Sony's shared new `play`/`pause`/`rewind`/`fastForward` capabilities rather than
per-brand UI. Rendered under `DpadCluster`'s existing `playPause` row. `StreamingAppsRow` and the
Menu/Source rows needed no change — they were already capability-gated; Samsung and Sony just now
pass that gate.

## What this does NOT do

- No fixed layout, no greyed-out "not supported" placeholders — Sean was shown that option and
  chose real capability growth instead.
- No IR fallback for brands that still can't do something a protocol doesn't support — out of
  scope for this ask; a future, separate decision if raised.
