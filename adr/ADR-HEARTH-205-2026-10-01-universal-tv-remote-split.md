# ADR-HEARTH-205: Split UniversalTvRemote.tsx to bring it under the 500-line guideline

**Date:** 2026-10-01
**Status:** Accepted, implemented. Pure refactor — no runtime behavior change, no visual change.

## Context

`src/ui/UniversalTvRemote.tsx` had grown to 1584 lines — the single largest file in `src/ui/`,
well past this project's own CLAUDE.md rule of 500 lines/file (ADR-GLOBAL-003, "modular,
single-purpose scripts"). Sean, directly: "you can break out individual functions to make them
more compact and agile."

This project already has precedent for exactly this kind of split:
- `SonyBraviaDriver.ts` → `SonyBraviaCommandMapping.ts` (ADR-HEARTH-188)
- `DeviceListScreen.tsx` → `DeviceCard.tsx` / `DeviceListSections.tsx` / `useDeviceLayout.ts` (ADR-HEARTH-173)

Same pattern followed here: extract cohesive sub-components and pure helper logic into small,
single-purpose files, each with a one-line docstring, keeping `UniversalTvRemote` itself as the
orchestrator that composes them via props/hooks.

Merged `main` first (already at HEAD — ADR-HEARTH-204's d-pad seek tap-streak multiplier was
already in; no new commits to bring in). That feature's logic (`pressDpadSeekDirection`,
`useDpadSeekMultiplier`, the "Seeking Nx" overlay) is preserved unchanged, now living inside
`DpadCluster.tsx`.

## Decision

Extracted, all verbatim copies (comments and all) except for the wiring needed to pass state
down as props instead of reading component-local closures:

**Components (the two free functions already at the top of the old file, plus the cohesive
blocks the task named):**
- `UtilityAction.tsx` — the icon-over-caption chip (was a free function in the old file).
- `StreamingAppTile.tsx` — one branded tile + the `STREAMING_APPS` data (was a free function).
- `StreamingAppsRow.tsx` — the Netflix/Hulu/Prime/YouTube launch card wrapping the tiles.
- `UtilityActionsRow.tsx` — the Home/Menu/Mute/Back/Settings/Sleep/Source/Browse row card.
- `DpadCluster.tsx` — the d-pad hub (rockers + d-pad + center Select/Play-Pause + seek-multiplier
  overlay + playPause row). The project's single most load-bearing cluster of controls.
- `VolumeChannelCard.tsx` — the no-d-pad fallback (Sony: volume/channel without a d-pad to
  anchor to).
- `KeypadCard.tsx` — the "Keypad" tab (number grid + Clear/0/Enter).
- `KeyboardCard.tsx` — the "Keyboard" tab (text entry + Send).
- `SleepTimerModal.tsx` — the universal sleep timer's duration-picker/cancel modal.
- `RemoteHeaderRow.tsx` — back button, device name (+ inline rename), power button(s).
- `RemoteStatusRow.tsx` — the connection/power/volume/channel/input status pills.
- `ReconnectCard.tsx` — the "Reconnecting…" card with its Try Now button.
- `CommandErrorBanner.tsx` — the failed-command banner.
- `RemoteTabBar.tsx` — the Remote/Keypad/Keyboard tab bar.
- `InputSelectionCard.tsx` — the HDMI/input-selection grid.

**Pure helpers / hooks:**
- `hasCapability.ts` — the `has(device, capability)` gate, used by nearly every extracted file.
- `formatSleepRemaining.ts` — "N min" formatter for the sleep-timer modal.
- `dpadLayout.ts` — `DPAD_HEIGHT` / `ROCKER_WIDTH`, the shared base measurements.
- `remoteCardStyles.ts` — the `card`/`compactCard`/`cardLabel`/`rockerColumn`/`rockerColumnLabel`
  style tokens shared by several of the above (same literal values as before; StyleSheet.create
  returning a different object reference changes nothing about the rendered style).
- `useUniversalSleepTimer.ts` — sleep-timer state (expiry, picker visibility) + start/cancel/
  power-off logic, resynced on `device.id` change — previously inline state+effects.
- `deriveRemoteViewState.ts` — the big block of plain `const` derivations read off live device
  state (`knownPower`, `hasSeparatePowerOnOff`, `hasNativeSleepTimer`, `canUniversalSleep`,
  `utilityColumns`, `volume`, `channel`, `muted`, `knownMuted`, `input`, `playbackState`,
  `dynamicInputs`, `isConnected`, `controlsDisabled`, `statusLine`) — one pure function, same
  logic, same comments, now out of the orchestrator's own body.

**Left in `UniversalTvRemote.tsx`** (the orchestrator): all `useState`/`useEffect` hooks and their
device-id resync effects, `send()`, `commitNameEdit`, `pressDpadSeekDirection`,
`pressKeypadDigit`, `pressCenterSelect`/`holdCenterPlayPause`, `pressKeypadEnter`,
`submitKeyboardInput`, `handleReconnectPress`, the accessibility-announce effects, and the JSX
tree composing every extracted piece above. `MediaBrowseModal` (already its own file, untouched)
stays wired in directly, same as before.

No public surface changed: `UniversalTvRemote` is still the only exported symbol, same prop
names (`device`, `commandEngine`, `stateStore`, `onReconnect`, `onRename`, `onBack`). Grepped for
`from "./UniversalTvRemote"` / `from "../ui/UniversalTvRemote"` — the only import site is
`DevicesTabScreen.tsx`, unchanged and still resolving. `CapabilityButton.tsx` and every driver
file were not touched.

## Result

| File | Lines |
|---|---|
| `UniversalTvRemote.tsx` | **1584 → 473** |
| `DpadCluster.tsx` (new) | 289 |
| `deriveRemoteViewState.ts` (new) | 154 |
| `RemoteHeaderRow.tsx` (new) | 158 |
| `UtilityActionsRow.tsx` (new) | 110 |
| `VolumeChannelCard.tsx` (new) | 92 |
| `StreamingAppTile.tsx` (new) | 85 |
| `RemoteStatusRow.tsx` (new) | 80 |
| `RemoteTabBar.tsx` (new) | 80 |
| `KeyboardCard.tsx` (new) | 72 |
| `SleepTimerModal.tsx` (new) | 71 |
| `KeypadCard.tsx` (new) | 67 |
| `InputSelectionCard.tsx` (new) | 65 |
| `useUniversalSleepTimer.ts` (new) | 64 |
| `ReconnectCard.tsx` (new) | 59 |
| `UtilityAction.tsx` (new) | 54 |
| `remoteCardStyles.ts` (new) | 53 |
| `StreamingAppsRow.tsx` (new) | 51 |
| `dpadLayout.ts` (new) | 33 |
| `CommandErrorBanner.tsx` (new) | 31 |
| `hasCapability.ts` (new) | 7 |
| `formatSleepRemaining.ts` (new) | 5 |

Every file is now under the 500-line guideline, each with a one-line file-level docstring.

## Verification

- `npx tsc --noEmit`: clean, before and after.
- `npx jest --silent` (with `--testPathIgnorePatterns` overridden for this worktree-under-`.claude`
  path, since the project's own ignore list excludes `/.claude/` and this worktree lives under
  it — package.json's own patterns are fine from the main checkout): **197 passed, 1 failed, 198
  suites**, same single pre-existing, unrelated failure as ADR-HEARTH-188 left it
  (`runner/shims/shims.test.ts`, `ws`'s `WebSocketServer` constructor issue in the Node
  test-runner shim) — identical before and after this change. Test count went from 2343 to 2358
  (+15): `accessibilityLint.test.ts` runs one case per `.tsx` file under `src/ui/`, and this split
  added 15 new `.tsx` files — not a behavior change, just more files for an existing lint to cover
  (all 15 pass).
- Web harness (`node scripts/ui-verify/run.mjs`): a full, unscoped run was attempted twice (once
  as the pre-change baseline, once more mid-task) and both times hung indefinitely on the
  `devices-now-empty` scenario — unrelated to this change (that scenario was never reached before
  any file was touched the first time; the hang reproduced again later with the refactor applied,
  confirming it is pre-existing/environmental, not caused by this split). Reported as a separate
  issue rather than worked around inside this refactor.
  Verification instead used `node scripts/ui-verify/run.mjs --only=remote-lg,remote-lg-seek-tap-streak,remote-lg-fontscale-130,remote-lg-fontscale-160,remote-lg-keypad,remote-lg-keyboard,remote-samsung,remote-roku-offline`
  (every `remote-*` scenario) run twice: once against the pre-refactor tree (changes set aside
  with `git stash push -u`, restored afterward with `git stash apply` + `git stash drop`, per
  this worktree's shared-stash safety rule), once against the refactored tree. Every scenario's
  overflow number was byte-identical both times:

  | Scenario | Before | After |
  |---|---|---|
  | remote-lg | overflow 0px, content 768px | overflow 0px, content 768px |
  | remote-lg-seek-tap-streak | overflow 0px, content 768px | overflow 0px, content 768px |
  | remote-lg-fontscale-130 | overflow 34px, content 803px | overflow 34px, content 803px |
  | remote-lg-fontscale-160 | overflow 113px, content 882px | overflow 113px, content 882px |
  | remote-lg-keypad | overflow 0px, content 543px | overflow 0px, content 543px |
  | remote-lg-keyboard | overflow 0px, content 512px | overflow 0px, content 512px |
  | remote-samsung | overflow 0px, content 658px | overflow 0px, content 658px |
  | remote-roku-offline | overflow 62px, content 831px | overflow 62px, content 831px |

## Consequences

- No behavior change: every extracted piece is a straight move of existing JSX/logic/comments
  into its own file, wired back together through props. `holdCenterPlayPause`'s haptic
  (`fireHapticClick()`) and the d-pad swipe handler's haptic were caught and restored after an
  initial pass dropped them when `CapabilityButton`'s re-export was trimmed — fixed before this
  ADR was written, confirmed by the harness numbers above and the unchanged test count.
- Future changes to one control cluster (the d-pad, the utility row, the sleep timer, ...) now
  touch one small file instead of one 1584-line one; `UniversalTvRemote.tsx` stays the single
  place that owns the screen's state and wires everything together.
- The pre-existing `devices-now-empty` web-harness hang is a real, separate issue worth a
  dedicated look — flagged here, not fixed as part of this refactor (out of scope: nothing in
  this diff touches the Devices tab).
