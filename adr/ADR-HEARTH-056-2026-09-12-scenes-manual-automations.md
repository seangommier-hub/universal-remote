# ADR-HEARTH-056: Scenes — manually-triggered multi-device macros (v1 of "automations")

Date: 2026-09-12

## Status

Accepted.

## Context

Sean, directly: "automations need to be added. this is meant to be an all in one home automation
app," alongside "keep working and pushing to expo go" — the latter is a real constraint, not just a
tempo instruction: this project has stayed on Expo Go all night specifically because no signed
standalone/dev-client build has ever successfully installed (the whole SideSign saga, still
unresolved). Any new feature has to work inside that constraint or it can't actually be tested or
used tonight.

"Automations" in the full sense most smart-home apps mean it — a rule engine with time-of-day
triggers, device-state conditions, and background execution — is not buildable under that
constraint at all, independent of effort: real triggers need the app to do something while it isn't
open (a scheduled time firing, a sensor crossing a threshold), which needs a background task API
(e.g. `expo-task-manager`'s background fetch/tasks). Expo Go does not support registering background
tasks — that's a dev-client-only capability, gated behind the exact native-build wall this whole
project has been stuck on tonight. Building a trigger engine that can only ever run while the app
happens to be open in the foreground would be dishonest — it wouldn't do what "automation" implies
(fire at 7pm whether or not the phone is unlocked), and worse, would look done without being able to
actually deliver on the promise.

## Decision

Built the buildable slice: **Scenes** — a named, manually-triggered group of actions across one or
more devices, run in order with one tap from the home screen (e.g. "Movie Night": power on the TV,
mute the receiver). This is real automation in the "compose several device actions into one command"
sense, just not the "fires on its own" sense — an honest, working v1 rather than a half-built trigger
engine that can't actually trigger anything under Expo Go.

Scope decisions within Scenes itself, kept deliberately small to ship a real, working v1 tonight
rather than a half-finished bigger one:

- **Actions are limited to no-argument capabilities** (`power`, `volumeUp`, `mute`, `playPause`,
  etc. — see `NO_ARG_CAPABILITIES` in `CreateSceneScreen.tsx`). Capabilities needing an argument
  (`inputSelection`, `setVolume`, `setBrightness`, `setColor`, `launchApp`, `setChannel`,
  `directionalNavigation`) would each need their own per-capability argument-picker UI (an input-id
  list, a numeric slider, a color picker, a service list) — real, valuable future work, not part of
  this pass. Every real driver in this app declares at least one no-arg capability, so this isn't a
  dead end for any device type today.
- **Creation only, no editing** — deleting and recreating a scene is the only way to change it right
  now. A real edit flow is straightforward to add later (`CreateSceneScreen` already takes a fully
  general `actions` list) but wasn't necessary to ship a working first version.
- **No confirmation/preview before running** — tapping a scene chip runs it immediately; failures
  surface afterward via a plain summary alert (`handleRunScene` in `App.tsx`), not a per-action
  progress screen.
- **Sequential execution, not parallel** (`sceneRunner.ts`) — matches this app's existing "don't pile
  concurrent commands onto a device that might be mid-reconnect" caution (see ADR-HEARTH-052's
  reconnect-storm finding from earlier tonight, a different mechanism but the same underlying
  lesson: uncoordinated concurrent requests to the same real hardware cause real problems).

New files: `src/core/types/Scene.ts`, `src/runtime/scenePersistence.ts` (plain `AsyncStorage`, no
`SecureStore` split needed — a Scene never holds a credential), `src/runtime/sceneRunner.ts`,
`src/ui/CreateSceneScreen.tsx`. `DeviceListScreen.tsx` gained a compact horizontal scene-chip row
(a separate sibling `FlatList`, not nested inside the existing vertical device list) between the
header and the device list — deliberately not a full section/grid, to avoid competing with the
device list for vertical space on the home screen, the same "one screen" pressure that's shaped
several other layout decisions tonight (ADR-HEARTH-050, -053).

## Consequences

- Real, working feature tonight: create a scene from any combination of paired devices' plain
  toggle/action capabilities, run it with one tap, delete it via long-press (same interaction
  pattern as removing a device).
- Not yet built: any capability needing an argument in a scene action, scene editing, scene
  reordering, and — the actual triggers this ADR's Context explains can't be built at all under
  Expo Go — time-of-day, device-state, or location-based automation. If/when a real signed
  standalone build exists, background-task-driven triggers become a real, separate future ADR, not
  a small addition to this one.
- All 238 existing tests still pass. **Update, same night**: added `sceneRunner.test.ts` (6 tests —
  sequential-not-parallel execution order, full success, partial failure, total failure, an empty
  scene, and a failure with no `error` object still producing a usable message) — the follow-up this
  ADR flagged as worth doing, done rather than left open. `Scene`/`scenePersistence`/
  `CreateSceneScreen` remain covered by type-checking plus the live emulator verification below,
  same as before.

## Related

[[hearth_new_integrations_include_fcc]] (checked and not applicable here — Scenes only ever call
`CommandEngine.execute`, the same path every existing button in this app already uses; there is no
new device protocol, so nothing new to relay through Family Command Center), ADR-HEARTH-050,
[[ADR-HEARTH-053]], ADR-HEARTH-052
