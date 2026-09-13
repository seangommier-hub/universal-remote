# ADR-HEARTH-059: Scenes can switch a device's input

Date: 2026-09-12

## Status

Accepted.

## Context

ADR-HEARTH-056 scoped Scenes to no-arg capabilities only, explicitly naming `inputSelection` as one
of several excluded capabilities needing "a real per-capability arg editor." On reflection while
continuing this feature ("keep going"), `inputSelection` specifically doesn't need a *new* editor:
its one argument is a device's own real input id, and that list already exists in live state
(`state.values.inputs`) — the exact same data `UniversalTvRemote.tsx`'s Input card already reads.
Sean's own example scenario ("Movie Night") is meaningfully more useful with this: powering on the
TV and muting the receiver without also switching to the right HDMI input leaves the actual point of
"movie night" undone.

`setVolume`, `setBrightness`, `setColor`, `launchApp`, `directionalNavigation`, and `setChannel`
remain out of scope — each genuinely needs a new kind of input (a number, a color, a fixed service
list, a direction) that `inputSelection` doesn't, since its list of valid values is already sitting
in state for any device that has ever connected.

## Decision

`SceneAction` gained an optional `args?: Record<string, unknown>` field (mirroring `Command`'s own
shape exactly) — every existing no-arg action is unaffected since `args` stays `undefined` for them.
`sceneRunner.ts` passes `action.args` through to `CommandEngine.execute()` unchanged.

`CreateSceneScreen` now takes a `stateStore: StateStore` prop. For any paired device that declares
`inputSelection` and has a non-empty live `values.inputs` list, a "Switch input to:" row of chips
appears under its existing no-arg action chips. Selecting an input *replaces* any previously-selected
input for that same device (a scene can only switch a device to one input, not several at once) —
tapping the already-selected input again removes it, the same toggle-off behavior every other action
chip already has. The scene summary card resolves an `inputSelection` action to the input's real
label (e.g. "Downstairs Living Room — HDMI 1"), not the raw capability name, via a new
`describeAction` helper.

## Consequences

- A device whose input list hasn't loaded yet (never connected this session, or `refreshInputList`
  hasn't completed) simply doesn't show an input row until it has — no error, no stale/guessed list,
  consistent with how the remote screen's own Input card already handles this.
- `sceneRunner.test.ts` gained a test confirming `args` passes through to `CommandEngine.execute`
  unchanged (7 tests total now, up from 6). `CreateSceneScreen.tsx` itself remains covered by
  type-checking plus live verification, same as ADR-HEARTH-056/058.
- All 257 existing tests still pass; typecheck clean.

## Related

[[ADR-HEARTH-056]], [[ADR-HEARTH-058]]
