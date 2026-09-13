# ADR-HEARTH-057: Proactive audit for the same header-truncation bug class elsewhere in the app

Date: 2026-09-12

## Status

Accepted.

## Context

[[ADR-HEARTH-053]] (earlier tonight) found and fixed a real overlap on `UniversalTvRemote.tsx`'s
rename row, live: a long device name pushed the rename pencil icon into the power button, because
`deviceNameRow` opted out of stretching to its parent's bounded width (`alignSelf: "flex-start"`)
and `deviceName`'s `Text` had no `flexShrink`. With Sean's "keep going" directive and no new
hardware discovered to test against, this ADR is a proactive code-level audit for the same bug
*class* — a `flex:1` container without `minWidth: 0`, or a `Text` without `flexShrink`/
`numberOfLines`, that a long enough string could overflow into a neighboring control — across the
rest of `src/ui`, rather than waiting for Sean to hit each one live.

## Findings and fixes

- **`LightControlScreen.tsx`'s rename row** (the Hue light-control screen — same header shape as
  the TV remote screen, never live-tested tonight since no Hue device is paired). Its
  `deviceNameRow` did *not* have the `alignSelf: "flex-start"` bug — but `deviceName`'s `Text` still
  defaulted to `flexShrink: 0` (a row child's normal default), which lets it render at full natural
  width regardless of the row's own bound and overflow past it, since a `View` doesn't clip overflow
  by default. Same visible symptom (pencil pushed into the power button) via a different specific
  mechanism. Fixed: `flexShrink: 1` on `deviceName`, `minWidth: 0` on `deviceNameRow`. Also matched
  Sean's "make the header font smaller" request (applied to `UniversalTvRemote.tsx` earlier
  tonight) here for consistency — `theme.type.title` (24) down to `subtitle` (17).
- **`DeviceListScreen.tsx`'s device-row card** (the home screen's actual device list — not a
  header, but the identical `flex:1` container + un-truncated `Text` shape, this time risking
  overlap with the row's `chevron-forward` icon instead of a power button). `cardBody` was `flex: 1`
  with no `minWidth: 0`, and neither `deviceName` nor `deviceMeta` had `numberOfLines`. Fixed:
  `minWidth: 0` on `cardBody`, `numberOfLines={1}` on both `Text`s.
- **Checked, not changed**: `CommandCenterRemoteScreen.tsx` has no rename row (a fixed "Command
  Center" title, never user-editable) — not applicable. The Scenes chip row (`sceneChip`/
  `newSceneChip` in `DeviceListScreen.tsx`, added earlier tonight) already has `numberOfLines={1}`
  and a fixed `maxWidth`. `CreateSceneScreen.tsx`'s device-name labels are plain, unconstrained
  `Text` in their own row with nothing beside them to overlap — not applicable.

## Consequences

- `LightControlScreen.tsx`'s fix is **not live-verified** — no Hue device is currently paired to
  test against (Sean previously said to leave Hue alone for now). Verified by the same reasoning
  chain as `ADR-HEARTH-053`'s actual live fix, and by re-reading the exact rendered JSX, but this is
  a code-derived fix, not a confirmed-on-device one, until a real Hue light is paired.
- `DeviceListScreen.tsx`'s fix **is** live-verified: reloaded with the real "Downstairs Living Room"
  device (18 characters, already known to be long enough to have triggered the identical-class bug
  on the remote screen) and confirmed via screenshot — full name renders on one line, chevron intact,
  no overlap.
- All 257 tests still pass; typecheck clean.

## Related

[[ADR-HEARTH-053]], ADR-HEARTH-046, [[ADR-HEARTH-049]]
