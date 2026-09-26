// ADR-HEARTH-156: who a device is and what to call it. Pure: no network, no storage. The best name
// almost always comes from the device itself (the person already named it in its own settings), so
// the resolver ranks sources instead of every screen inventing its own default.

/** Everything known about one physical device, whichever source it came from. */
export interface DeviceIdentity {
  brand: string | null;
  model?: string;
  name?: string;
  uuid?: string;
  mac?: string;
  serial?: string;
  /** Human-readable notes on how each field was learned. */
  evidence: string[];
}

/** Where a resolved name came from, from most to least trusted. */
export type NameSourceKind = "user" | "device" | "friendly" | "hostname" | "vendor-model" | "brand" | "unknown";

/** Candidate names, one slot per source; any slot may be missing. */
export interface NameSources {
  /** A name typed in Hearth. */
  userTyped?: string | null;
  /** The name the device reports about itself (its own settings). */
  reported?: string | null;
  /** UPnP / mDNS friendly name seen during discovery. */
  friendly?: string | null;
  /** Router / DHCP hostname, cleaned before use. */
  hostname?: string | null;
  vendor?: string | null;
  model?: string | null;
  brandLabel?: string | null;
}

export interface ResolvedName {
  name: string;
  source: NameSourceKind;
}

export const UNKNOWN_DEVICE_NAME = "Unknown device";

const DOMAIN_SUFFIX = /\.(lan|local|home|localdomain|internal|fritz\.box|router|gateway)$/i;
const FIRST_LABEL_ONLY = /^([^.\s]+)\..*$/;
const TRAILING_NOISE_TOKEN = /^(?:[0-9a-f]{6}|[0-9a-f]{12}|x{2,})$/i;
const GENERIC_BRACKET_TAGS = new Set(["tv", "soundbar", "av", "audio", "stb", "hometheater", "projector"]);
const LEADING_BRACKET_TAG = /^\[([^\]]+)\]\s*(.*)$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Whole-hostname rules for names that have no useful word structure; first match wins, empty means "no name". */
const HOSTNAME_ALIASES: Array<[RegExp, string]> = [
  [/^lg\s*web\s*os\s*tv/i, "LG TV"],
  [/^lg\s*smart\s*tv/i, "LG TV"],
  [/^samsung\s*(?:smart\s*)?tv/i, "Samsung TV"],
  [/^esp[-_ ]?[0-9a-f]{4,12}$/i, "ESP device"],
  [/^android[-_ ]?[0-9a-f]{8,}$/i, "Android device"],
  [/^wlan\d*$/i, ""],
];

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitCamelCase(value: string): string {
  return value.replace(/([a-z]{2})([A-Z])/g, "$1 $2");
}

/** Cleans a router / DHCP hostname into words a person would say, or null when nothing meaningful is left. */
export function cleanHostname(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || IPV4.test(trimmed)) return null;
  const firstLabel = trimmed.replace(DOMAIN_SUFFIX, "").replace(FIRST_LABEL_ONLY, "$1");
  for (const [pattern, replacement] of HOSTNAME_ALIASES) {
    if (pattern.test(firstLabel)) return replacement || null;
  }
  const tokens = tidy(firstLabel.replace(/[_-]+/g, " ")).split(" ").filter(Boolean);
  while (tokens.length > 1 && TRAILING_NOISE_TOKEN.test(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length === 0 || (tokens.length === 1 && TRAILING_NOISE_TOKEN.test(tokens[0]))) return null;
  return tidy(tokens.map(splitCamelCase).join(" ")) || null;
}

/** Tidies a device-reported name: drops generic bracket tags like "[TV]" and turns "[LG]" into a plain prefix. */
export function cleanReportedName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = tidy(raw);
  const match = LEADING_BRACKET_TAG.exec(text);
  if (!match) return text || null;
  const tag = match[1].trim();
  const body = match[2].trim();
  if (!body) return tag || null;
  const dropTag = GENERIC_BRACKET_TAGS.has(tag.toLowerCase()) || body.toLowerCase().startsWith(tag.toLowerCase());
  return dropTag ? body : tidy(`${tag} ${body}`);
}

function vendorAndModel(vendor?: string | null, model?: string | null): string | null {
  const vendorText = vendor?.trim();
  const modelText = model?.trim();
  if (vendorText && modelText) {
    return modelText.toLowerCase().startsWith(vendorText.toLowerCase()) ? modelText : `${vendorText} ${modelText}`;
  }
  return modelText || null;
}

/** Picks the best name for a device by the fixed precedence: user, self-reported, friendly, hostname, vendor+model, brand, unknown. */
export function resolveDisplayName(sources: NameSources): ResolvedName {
  const user = sources.userTyped ? tidy(sources.userTyped) : "";
  if (user) return { name: user, source: "user" };
  const reported = cleanReportedName(sources.reported);
  if (reported) return { name: reported, source: "device" };
  const friendly = cleanReportedName(sources.friendly);
  if (friendly) return { name: friendly, source: "friendly" };
  const hostname = cleanHostname(sources.hostname);
  if (hostname) return { name: hostname, source: "hostname" };
  const vendorModel = vendorAndModel(sources.vendor, sources.model);
  if (vendorModel) return { name: vendorModel, source: "vendor-model" };
  const brand = sources.brandLabel?.trim();
  if (brand) return { name: brand, source: "brand" };
  return { name: UNKNOWN_DEVICE_NAME, source: "unknown" };
}
