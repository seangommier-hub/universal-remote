# ADR-HEARTH-058: Editing an existing Scene

Date: 2026-09-12

## Status

Accepted.

## Context

ADR-HEARTH-056 shipped Scenes with creation and deletion only, explicitly flagging editing as "a
reasonable, cheap follow-up" since `CreateSceneScreen` already took a fully general `actions` list.
Sean: "keep working" — following through on that flagged item.

## Decision

`CreateSceneScreen` takes an optional `editingScene?: Scene` prop: when given, it pre-fills the name
and action list from it, shows "Edit Scene"/"Save Changes" instead of "New Scene"/"Save Scene", and
saves back over the same `scene.id` instead of generating a new `scene-${Date.now()}` one.

Reached via the same long-press menu `showSceneActions` already used for delete
(`DeviceListScreen.tsx`) — now offering Cancel / Edit / Delete instead of just Cancel / Delete. No
new gesture or entry point.

`App.tsx`'s `Screen` union gained `editingScene?: Scene` on the `"create-scene"` state, and
`handleSceneCreated` was renamed `handleSceneSaved` and changed from an unconditional append
(`[...current, scene]`) to an upsert (`[...current.filter(s => s.id !== scene.id), scene]`) — the
same "add or overwrite by id" shape `scenePersistence.saveScene` already uses, so a save from either
mode (new or editing) behaves correctly without the caller needing to know which one it was.

## Consequences

- A scene referencing a device that's since been removed still shows correctly in the edit screen's
  summary list (via the existing `device?.name ?? action.deviceId` fallback already in
  `CreateSceneScreen`) and can still be removed from the scene there, even though that device no
  longer has its own chip-picker section to re-add it from — acceptable, not a new gap this ADR
  introduces.
- All 257 tests still pass; typecheck clean.

## Related

[[ADR-HEARTH-056]]
