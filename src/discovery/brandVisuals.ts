// ADR-HEARTH-167: a recognizable tile for each brand in the picker. No trademarked logo files are
// bundled; each brand gets its own accent color and a short monogram, which is what people scan
// for. A brand missing from BRAND_COLORS (a newly added one) falls back to a stable color derived
// from its id, so it never renders blank and never needs a change here.

export const BRAND_COLORS: Record<string, string> = {
  lg: "#E5334B",
  samsung: "#3D6DE0",
  sony: "#8A94A6",
  roku: "#9B59D6",
  yamaha: "#C8323C",
  denon: "#4C8DAF",
  sonos: "#B0B7C3",
  kasa: "#3CB8A0",
  chromecast: "#4C9BF0",
  appletv: "#B7BDC9",
  ps5: "#2F6FDB",
  xbox: "#3BAA4A",
  hue: "#F2A93B",
  broadlink: "#E5793B",
  feeder: "#8FBF5A",
  smartthings: "#3FA0E8",
  switchbot: "#F05A5A",
};

const FALLBACK_PALETTE = ["#FF7A45", "#5FD98A", "#5AA9E6", "#C084FC", "#F2C94C", "#F27A9A"];
const MONOGRAM_MAX_LENGTH = 2;
const TINT_ALPHA_HEX = "26";

export interface BrandVisual {
  /** Solid brand color (text, border). */
  color: string;
  /** The same color at low opacity, for the tile background. */
  tint: string;
  /** One or two letters standing in for a logo. */
  monogram: string;
}

function hashOf(text: string): number {
  return Array.from(text).reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 100003, 7);
}

/** Up to two letters: the initials of the first two words, or the first two characters of a single word ("PS5" becomes "PS"). */
export function monogramFor(label: string): string {
  const words = label.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, MONOGRAM_MAX_LENGTH) : words.slice(0, MONOGRAM_MAX_LENGTH).map((word) => word[0]).join("");
  return letters.toUpperCase();
}

/** The color, tint and monogram to draw for a brand. */
export function brandVisual(brand: { id: string; label: string }): BrandVisual {
  const color = BRAND_COLORS[brand.id] ?? FALLBACK_PALETTE[hashOf(brand.id) % FALLBACK_PALETTE.length];
  return { color, tint: `${color}${TINT_ALPHA_HEX}`, monogram: monogramFor(brand.label) };
}
