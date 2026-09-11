import { useWindowDimensions } from "react-native";

// Real-device design pass (2026-09-11): the remote screen's circular touch
// targets (the d-pad, its rocker columns, the keypad) were tuned against a
// fixed 375pt-wide screen (iPhone SE and similar) -- confirmed by grep, that
// exact width is named in half a dozen comments across UniversalTvRemote.tsx.
// A wider phone or a tablet rendered those same fixed-pixel circles at the
// SAME absolute size, so they'd read as too small (wasted space around them)
// on a bigger screen, or -- on a narrower folded/split-screen window --
// could crowd or clip. Sean, directly: "everything needs to be perfect...
// dynamic for any device."
//
// Baseline every fixed-pixel measurement was actually tuned against, so
// scaling relative to it (not to some other arbitrary reference) keeps every
// already-verified proportion intact -- the d-pad's own square bounding box,
// the "each arrow lands exactly tangent to the disc's rim" math (ADR-HEARTH-037),
// the "hub row fits a 375pt screen with margin to spare" calculation
// (ADR-HEARTH-016) -- all of it is built from the same scaled base units, so
// it stays internally self-consistent on any device instead of needing
// separate rework per screen size.
const BASELINE_WIDTH = 375;

// Clamped, not a raw ratio: an iPad's much wider window would otherwise blow
// touch targets up to an ungainly size (there's no HIG reason a d-pad needs
// to be 2x bigger just because the window is 2x wider), and a narrow
// split-screen/folded window shouldn't shrink circles below a comfortable
// tap size. This range keeps scaling meaningful (a real iPhone Pro Max vs.
// SE difference is clearly visible) without letting either extreme look
// broken.
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.35;

/**
 * A device-width-derived scale factor for this screen's fixed-pixel touch
 * targets (circle diameters, the d-pad disc, rocker-column heights) --
 * multiply theme.circleDiameter values and DPAD_HEIGHT-derived sizes by
 * this instead of using the raw constant directly. Deliberately does NOT scale font
 * sizes or spacing/padding: type size is an OS-level Dynamic Type/accessibility
 * concern (`allowFontScaling`, on by default), a separate axis from "which
 * physical screen this is," and mixing the two would risk fonts becoming
 * too large on top of a user's own accessibility text-size setting; spacing
 * stays visually consistent across size classes on purpose, matching how
 * Apple's own HIG treats layout margins vs. touch-target sizing as separate
 * concerns.
 */
export function useResponsiveScale(): number {
  const { width } = useWindowDimensions();
  const raw = width / BASELINE_WIDTH;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}
