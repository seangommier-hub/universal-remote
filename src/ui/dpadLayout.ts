import { theme } from "./theme";

/** Shared base measurements for the remote screen's d-pad and its volume/channel rockers. */

// Real-device finding (2026-09-12): "the card with the arrows... looks awful" — traced to a real
// misalignment, not a vague taste complaint. The d-pad column (up + gap + middle-row-with-the-
// large-Select-button + gap + down) is 196px tall; the volume/channel rocker columns beside it,
// gap-based with no matching height, were only ~136px — centered next to a taller neighbor, so
// their up/down buttons sat ~30px away from the d-pad's own up/down buttons instead of aligning
// with them. A real remote's side rockers align top-to-bottom with its d-pad; this one didn't.
export const DPAD_HEIGHT = theme.circleDiameter.sm * 2 + theme.circleDiameter.lg + theme.spacing.md * 2;
// Real-device ask (2026-09-10): "fix the navigation of the up down arrows for volume and
// navigation to be more neatly oriented." The rockers already align top-to-bottom with the
// d-pad (the height-matching fix above) — what's left is that the d-pad reads as one wheel
// (ADR-HEARTH-037: a shared disc the arrows sit ON) while the Vol/Ch rockers are still two bare
// floating circles with a label between them, on the card's own plain background. Giving each
// rocker its own matching disc (same radius/border/surface treatment) makes all three columns
// read as one consistent family of controls instead of one styled differently from the other
// two.
//
// Real-device regression, caught same day: the hub row's total width was already exactly
// tuned to fit a 375pt screen (ADR-HEARTH-016: "316px... ~11px to spare") assuming each rocker
// was exactly as wide as its own 52px button (no extra container width, just centered content).
// An earlier version of this fix used circleDiameter.lg (68) per rocker, adding ~32px total
// across both rockers — 21px past that budget, which is exactly the kind of overflow that pushes
// a row into wrapping onto a second line ("now the icons at the bottom span two lines"). Using
// circleDiameter.sm (52, the button's own diameter) instead keeps the disc exactly as wide as
// the button it holds — same total hub-row width as before this whole rocker-disc change, so the
// original, already-verified-fitting arithmetic is preserved exactly. The button sits tangent to
// the pill's own rounded sides, the same "arrow tangent to its disc's rim" relationship the
// d-pad's own arrows already have to their disc (ADR-HEARTH-037) — a deliberate visual echo, not
// a compromise.
export const ROCKER_WIDTH = theme.circleDiameter.sm;
