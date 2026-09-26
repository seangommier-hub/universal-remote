import { BrandEntry } from "./brandRegistry";

// ADR-HEARTH-167: typo-tolerant brand search for the manual-add picker. A person types what is on
// the box or the TV ("sammsung", "webos", "bravia"), not our registry label. Aliases live here,
// keyed by brand id, so adding a brand never requires touching the matcher (an id with no entry
// is still found by its label and manufacturer).

export const BRAND_ALIASES: Record<string, string[]> = {
  lg: ["webos", "oled", "nanocell"],
  samsung: ["tizen", "qled", "frame"],
  sony: ["bravia", "playstation tv"],
  roku: ["roku tv", "streaming stick"],
  yamaha: ["musiccast", "receiver", "soundbar"],
  denon: ["marantz", "heos", "receiver", "avr"],
  sonos: ["speaker", "beam", "arc", "soundbar"],
  kasa: ["tp-link", "tplink", "plug", "outlet", "smart plug"],
  chromecast: ["google tv", "cast", "google cast"],
  appletv: ["apple tv", "tvos"],
  ps5: ["playstation", "ps 5", "sony playstation"],
  xbox: ["microsoft", "series x", "series s"],
  hue: ["philips", "signify", "light", "bulb", "bridge"],
  broadlink: ["ir", "rf", "infrared", "universal remote", "rm4", "rm mini"],
  smartthings: ["samsung smartthings", "outlet", "plug"],
  switchbot: ["vacuum", "robot vacuum", "s1", "k10"],
};

const EXACT_SCORE = 100;
const PREFIX_SCORE = 80;
const SUBSTRING_SCORE = 60;
const FUZZY_BASE_SCORE = 40;
const MAX_FUZZY_LENGTH_DIVISOR = 4;
const MIN_FUZZY_QUERY_LENGTH = 3;
const NON_SEARCH_CHARACTERS = /[^a-z0-9 ]/g;

function normalize(text: string): string {
  return text.toLowerCase().replace(NON_SEARCH_CHARACTERS, " ").replace(/\s+/g, " ").trim();
}

/** Edit distance between two short strings (insert, delete, substitute, adjacent swap each cost 1). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(grid[i - 1][j] + 1, grid[i][j - 1] + 1, grid[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) grid[i][j] = Math.min(grid[i][j], grid[i - 2][j - 2] + 1);
    }
  }
  return grid[a.length][b.length];
}

function fuzzyScore(query: string, word: string): number {
  if (query.length < MIN_FUZZY_QUERY_LENGTH) return 0;
  const allowed = Math.max(1, Math.floor(query.length / MAX_FUZZY_LENGTH_DIVISOR));
  // Compare against the word's start too, so a half-typed misspelling ("samsu") still lands.
  const distance = Math.min(editDistance(query, word), editDistance(query, word.slice(0, query.length)));
  return distance <= allowed ? FUZZY_BASE_SCORE - distance : 0;
}

function scoreAgainst(query: string, phrase: string): number {
  const text = normalize(phrase);
  if (text === query) return EXACT_SCORE;
  if (text.startsWith(query)) return PREFIX_SCORE;
  if (text.includes(query)) return SUBSTRING_SCORE;
  const words = text.split(" ");
  return Math.max(0, ...words.map((word) => (word.startsWith(query) ? PREFIX_SCORE - 10 : fuzzyScore(query, word))));
}

function searchPhrases(brand: BrandEntry): string[] {
  return [brand.label, brand.manufacturer, ...(BRAND_ALIASES[brand.id] ?? [])];
}

/** How well a brand matches what was typed; 0 means not at all. */
export function scoreBrand(brand: BrandEntry, rawQuery: string): number {
  const query = normalize(rawQuery);
  if (!query) return 1;
  return Math.max(...searchPhrases(brand).map((phrase) => scoreAgainst(query, phrase)));
}

/** The brands that match, best first; an empty query returns them all in their original order. */
export function searchBrands(brands: BrandEntry[], rawQuery: string): BrandEntry[] {
  if (!normalize(rawQuery)) return brands;
  return brands
    .map((brand, index) => ({ brand, index, score: scoreBrand(brand, rawQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.brand);
}
