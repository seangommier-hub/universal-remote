# ADR-HEARTH-040: Touch targets on the remote screen scale to the actual device width

**Date:** 2026-09-11
**Status:** Accepted

## Context

Sean, directly: "the design agent needs to be re-run so that spacing is
evaluated and it is dynamic for any device," followed by "everything needs
to be perfect."

The remote screen's circular touch targets (the d-pad, its rocker columns,
the keypad, the utility row) were all fixed-pixel sizes (`theme.circleDiameter.sm/lg`,
`DPAD_HEIGHT`, a hardcoded `width: 64`), tuned and verified against one
specific reference width — "375pt-wide screen" (iPhone SE and similar)
appears in half a dozen comments across `UniversalTvRemote.tsx`'s own
history. That's correct arithmetic for that one screen size, but the same
fixed pixel values render identically small on a much wider phone (wasted
space around every button) or could crowd a narrower window.

The `StreamingAppTile` row was already effectively responsive by accident —
its tiles use `width: "22%"` (a percentage of the actual container width),
so it already scales correctly with the screen. The circular controls did
not, since they're sized from absolute constants.

## Decision

New `useResponsiveScale()` hook (`src/ui/useResponsiveScale.ts`): reads
`useWindowDimensions()`, returns `width / 375` clamped to `[0.85, 1.35]`.
375 is the exact baseline every existing fixed-pixel measurement was
already tuned against — scaling relative to it, rather than some other
reference, keeps every already-verified proportion (the d-pad's own square
bounding box, the "each arrow lands exactly tangent to the disc's rim"
math from ADR-HEARTH-037, the "hub row fits a 375pt screen with margin"
calculation from ADR-HEARTH-016) internally consistent on any device,
since they're all built from the same scaled base units rather than needing
independent rework per screen size. Clamped so an iPad's much wider window
doesn't blow touch targets up absurdly, and a narrow/split-screen window
doesn't shrink them below a comfortable tap size.

`CapabilityButton` gains an optional `scale` prop, **defaulting to 1** —
every existing call site across the rest of the app (device list, settings,
etc.) renders byte-for-byte identical to before this existed. Only
`UniversalTvRemote.tsx` computes a real scale and passes it through to
every circular button on that screen, plus inline size overrides for the
d-pad disc, rocker-column heights, the center spacer, and the utility
action's fixed width — all derived from the same `scale` value, so the
whole screen scales as one coherent unit rather than each piece being
tuned separately.

**Deliberately does NOT scale font size or spacing/padding.** Type size is
an OS-level Dynamic Type/accessibility concern (`allowFontScaling`, on by
default) — a different axis from "which physical screen this is," and
multiplying both together risks fonts becoming too large on top of a
user's own accessibility text-size setting. Spacing/margins stay visually
consistent across size classes on purpose, matching how Apple's own HIG
treats layout rhythm and touch-target sizing as separate concerns, not the
same slider.

## What this does NOT attempt

- **Not a system-wide token rewrite.** `theme.ts`'s own exported constants
  are untouched — every other screen in the app (which doesn't pass a
  `scale` prop) is completely unaffected. Extending this pattern to other
  screens is a separate, deliberate adoption, not an automatic side effect.
- **Not tested on a real tablet or a real oversized phone tonight** — the
  clamp range and 375 baseline are reasoned from the app's own documented
  history, not verified against real hardware at the extremes. Worth a
  real-device check next time Sean's on a different-sized device.

## Consequences

- `npx tsc --noEmit` clean, all 190 Jest tests still pass (style-only
  change to a screen with no dimension-based test coverage).
- Not yet verified on a real phone — next real checkpoint is Sean opening
  the remote screen on his actual device.
