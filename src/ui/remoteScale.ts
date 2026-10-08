// Framework-free math behind the remote screen's "everything scales together" rule (ADR-HEARTH-219).
//
// Sean, directly: "everything should be able to scale based on the device think iphone pro vs.
// pro max." One total scale (width-derived scale x height-fit scale, see UniversalTvRemote.tsx)
// multiplies every size on the remote screen -- tap targets, tile heights, paddings, gaps, icon
// sizes -- and, inside a legibility band, its text. This file is the one place that math lives so
// no component hand-rolls its own.

/** Text never shrinks below this fraction of its base size, however small the remote gets. */
export const FONT_SCALE_MIN = 0.85;
/** Text never grows beyond this fraction of its base size, however large the remote gets. */
export const FONT_SCALE_MAX = 1.25;

/**
 * Width, in px, of the remote column at scale 1 including the screen's own horizontal padding: the
 * Vol rocker + d-pad + Ch rocker row (316px, ADR-HEARTH-016), plus the hub card's horizontal
 * padding (2 x 8px) and the screen's (2 x 12px). The widest fixed-proportion piece of the remote,
 * so it sets the largest scale a window of a given width can show without clipping the hub.
 */
export const REMOTE_BASE_WIDTH_PX = 356;

/** The screen's own horizontal padding at scale 1 (px) -- subtracted from the column's max width. */
export const REMOTE_HORIZONTAL_PADDING_PX = 12;

/** How much wider than its design width the column may stretch on a phone before it stops growing
 * (and centers) -- keeps a tablet from stretching cards into wide slabs. */
export const REMOTE_MAX_WIDTH_STRETCH = 1.15;

/** Scales a layout size (padding, gap, diameter, height, radius, icon) by the remote's total scale. */
export function scaleSize(base: number, scale: number): number {
  return base * scale;
}

/** The scale text actually follows: the total scale, held inside [FONT_SCALE_MIN, FONT_SCALE_MAX]. */
export function fontScaleFor(scale: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale));
}

/** Scales a font size by the remote's total scale, clamped so text stays legible at every size. */
export function scaleFont(base: number, scale: number): number {
  return base * fontScaleFor(scale);
}

/**
 * Below this total scale the Vol/Ch rocker pills (52px x scale wide) get too narrow for their own
 * "VOL"/"CH" caption even at the minimum font size, so the caption is dropped rather than letting it
 * overflow the pill -- the up/down chevrons already say what the pill is for.
 */
export const ROCKER_LABEL_MIN_SCALE = 0.5;

/**
 * Cap on how far the OS font-size setting may enlarge the Vol/Ch caption. The pill is a fixed
 * ~52px x scale wide, so an uncapped 160% Dynamic Type size pushes "VOL" past its edges; the caption
 * is decorative (each button carries its own accessibility label), so a modest cap costs no access.
 */
export const ROCKER_LABEL_MAX_FONT_MULTIPLIER = 1.2;

/** Whether the rocker pills have room for their "VOL"/"CH" caption at this total scale. */
export function shouldShowRockerLabel(scale: number): boolean {
  return scale >= ROCKER_LABEL_MIN_SCALE;
}

/** The largest total scale a window this wide can show before the d-pad hub would clip horizontally. */
export function maxScaleForWidth(windowWidth: number): number {
  return windowWidth / REMOTE_BASE_WIDTH_PX;
}

/**
 * The widest the remote column may get (px) at this total scale -- bounds it on tablets. Never
 * narrower than the scale-1 design width: a remote shrunk for a SHORT screen (iPhone SE) still has
 * the phone's full width, and narrowing the column there would only truncate the tile wordmarks and
 * input labels (text doesn't shrink as fast as boxes) without buying any height.
 */
export function remoteMaxContentWidth(scale: number): number {
  return (REMOTE_BASE_WIDTH_PX - 2 * REMOTE_HORIZONTAL_PADDING_PX) * Math.max(scale, 1) * REMOTE_MAX_WIDTH_STRETCH;
}
