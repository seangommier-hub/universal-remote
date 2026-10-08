# ADR-HEARTH-218: remote d-pad arrows stay aligned when shrunk; only active inputs are shown

## Status

Accepted

## Context

Sean (2026-10-08), after the no-scroll remote shipped (ADR-HEARTH-217): "the arrows on it are now
not correct. inputs only need to be shown if they are active."

1. **Arrows.** ADR-HEARTH-217 shrinks the hub by `hubScale`, but the d-pad's own internal gaps
   (`spacing.md` between the arrow buttons) and the volume/channel rockers' vertical padding
   (`spacing.sm`) stayed fixed in pixels. The d-pad column's content became taller than its
   shrunken disc, pushing its up/down arrows past the rim, while the rockers' buttons stayed inset;
   the two sets of arrows stopped lining up (the alignment ADR-HEARTH-016/037 established).
2. **Inputs.** The LG input list showed every port the TV knows about, including ones with nothing
   plugged in.

## Decision

- `DpadCluster.tsx`/`VolumeChannelCard.tsx`: the d-pad's gap, its middle row's gap, and the rocker
  columns' vertical padding are multiplied by the hub scale, so all proportions hold at any size.
- `LgWebOsDriver.ts` keeps the TV's own per-input `connected` flag. New pure `activeInputs()`
  (`src/ui/activeInputs.ts`) hides inputs reported `connected: false`, but always keeps the
  currently selected input, keeps inputs the driver can't report on, and falls back to the full
  list rather than an empty card. Applied in `deriveRemoteViewState.ts`, so only the remote screen
  is filtered (scene building still sees every input).

## Consequences

- Fewer input rows also frees vertical space, so the fit scale shrinks less on LG.
- Drivers with no `connected` information (static hdmi1/2/3 fallback, other brands) are unchanged.
- Tests: `activeInputs.test.ts` (4), one new `LgWebOsDriver` test; `ui-verify` fit scenarios all pass.
