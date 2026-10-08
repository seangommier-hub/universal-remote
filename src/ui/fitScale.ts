// Framework-free math behind useRemoteFitScale.ts — same "plain function, directly unit-testable
// without the React rendering harness this project doesn't otherwise pull in" shape as
// tapStreak.ts / holdRepeatScheduler.ts.
//
// Real ask (2026-10-07, Sean, directly): "the remote should have a dynamic layout where it is
// able to be on one screen no matter the device... it shouldn't need to scroll." ADR-HEARTH-040's
// useResponsiveScale already scales the remote's circular touch targets by device WIDTH, but
// deliberately never measures or reacts to actual rendered HEIGHT — so a device/capability
// combination it wasn't hand-tuned against (ui-verify measured LG's own worst case: 89px of real
// overflow at the iPhone 17's 393x852 frame) still scrolls. This is the other axis: given the
// screen's actual available height and its actual rendered content height, how much further
// should the remote's own scalable elements shrink to make the two meet.

// Never shrinks the remote's biggest scalable element (the d-pad "wheel" + its rockers, see
// useRemoteFitScale.ts's own call sites) below this fraction of its width-derived size. Chosen so
// the worst case — the narrowest clamped width scale (0.85, ADR-HEARTH-040) combined with this
// floor — still leaves the d-pad's own center Select button comfortably above the 32px "xs" size
// ADR-HEARTH-121 already accepted as a deliberate, real tradeoff elsewhere on this same screen:
// 0.85 * 0.7 = 0.595; 68px (circleDiameter.lg) * 0.595 ≈ 40px, still bigger than that accepted xs
// tradeoff, not below it.
export const FIT_SCALE_FLOOR = 0.5;
/** Where every correction starts (and restarts): the width-derived size, untouched. */
export const FIT_SCALE_CEILING = 1;
/** ADR-HEARTH-219: how far the remote may GROW past its width-derived size to use spare height
 * (iPhone Pro Max vs. Pro). A hard cap so a tablet or a very tall window never produces
 * cartoonishly large controls -- the combined width*fit scale is also capped, see useRemoteFitScale. */
export const FIT_SCALE_GROW_CEILING = 1.4;
/** Spare height (beyond the safety margin) required before growing at all -- a dead band between
 * "grow" and "shrink" so the two corrections can never chase each other. */
export const FIT_GROW_THRESHOLD_PX = 24;

// Matches the ui-verify harness's own PASS threshold (measureOverflow.mjs: "overflow <= 1 is
// PASS") — there is no reason to keep correcting once the real check this is built to satisfy
// would already call it a pass, and stopping here is what guarantees the correction loop
// terminates rather than chasing sub-pixel differences forever.
export const FIT_TOLERANCE_PX = 1;

// A real margin, not just enough to clear FIT_TOLERANCE_PX by a hair. ADR-HEARTH-157's own
// caveat is explicit: web's fallback sans-serif font measures a few px different from a real
// device's SF font, and this screen's own history (ADR-HEARTH-135, ADR-HEARTH-121) is full of
// "fits with 1px to spare" fixes that then failed the moment one more thing was added. Converging
// to exactly 0-1px of spare on the one viewport this harness checks would repeat that same
// mistake with extra steps in between; targeting real headroom here is what "comfortable margin,
// not just barely" (this feature's own task) actually means in the math, not just in prose.
export const FIT_SAFETY_MARGIN_PX = 16;

/**
 * Given the current fitScale and a fresh measurement of the screen's available height (the
 * ScrollView's own viewport) vs. its actual rendered content height, returns the next fitScale to
 * try. Shrink-only and monotonically non-increasing while real overflow remains — growing back
 * toward 1 is deliberately NOT this function's job (see useRemoteFitScale.ts's own reset-on-resize
 * comment for why) — so repeatedly calling this with the same inputs always converges: each call
 * either returns the same value (already fits, or already at the floor) or a strictly smaller one
 * bounded below by FIT_SCALE_FLOOR, which a damped/undershooting proportional estimate (next
 * section) reaches in a bounded number of steps, never oscillating back up.
 *
 * The proportional estimate undershoots on purpose: content height is actually
 * `fixed + scalable * fitScale` (gaps/padding/text don't shrink with this factor, only the
 * elements that opt into it do), not purely proportional to fitScale alone, so naively solving
 * `current * (available / content)` as if it were still asks for less shrink than is really
 * needed the first time — which is exactly why the caller re-measures and calls this again rather
 * than trusting one estimate, and exactly why this never needs to overshoot past the floor in one
 * jump.
 */
export function nextFitScale(currentFitScale: number, availableHeight: number, contentHeight: number, maxFitScale: number = FIT_SCALE_GROW_CEILING): number {
  if (availableHeight <= 0 || contentHeight <= 0) return currentFitScale; // not measured yet
  const target = Math.max(1, availableHeight - FIT_SAFETY_MARGIN_PX); // leave real headroom, not just enough to pass
  const overflow = contentHeight - target;
  if (overflow > FIT_TOLERANCE_PX) {
    const proportionalEstimate = currentFitScale * (target / contentHeight);
    return Math.max(FIT_SCALE_FLOOR, Math.min(proportionalEstimate, currentFitScale));
  }
  // Fits. If there's real spare height (a Pro Max, a tablet), grow toward it. The same proportional
  // estimate UNDERSHOOTS on growth too (the fixed, non-scaling part of the content means the true
  // scale needed is larger than the proportional one), so growth approaches the fit from below and
  // never overshoots into overflow -- and the dead band above keeps it from re-triggering a shrink.
  const spare = target - contentHeight;
  if (spare <= FIT_GROW_THRESHOLD_PX || currentFitScale >= maxFitScale) return currentFitScale;
  const growthEstimate = currentFitScale * (target / contentHeight);
  return Math.min(maxFitScale, Math.max(currentFitScale, growthEstimate));
}
