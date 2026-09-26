// Which servers a pairing link or redeem response may point this phone at (ADR-HEARTH-160). A
// hearth://pair link can come from anyone, so its server address is only honored when it is a
// private-network address, a trusted public domain, or the household server already saved.

/** Public domains the household relay may live under; edit here to trust another domain. */
export const TRUSTED_PUBLIC_SUFFIXES: readonly string[] = [".carddna.app"];
const PRIVATE_NAME_SUFFIX = ".local";

const SERVER_URL_PATTERN = /^(https?):\/\/([a-z0-9.-]+)(?::(\d{1,5}))?(\/[^\s]*)?$/i;
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAX_HOST_LENGTH = 253;
const MAX_PORT = 65535;
const OCTET_MAX = 255;
const CLASS_A_PRIVATE = 10;
const CLASS_B_PRIVATE = 172;
const CLASS_B_PRIVATE_MIN = 16;
const CLASS_B_PRIVATE_MAX = 31;
const CLASS_C_PRIVATE = 192;
const CLASS_C_PRIVATE_SECOND = 168;

export interface ParsedServerUrl {
  scheme: "http" | "https";
  host: string;
}

/** Strictly parses an http(s) server address; null for anything with userinfo, odd characters or a bad host. */
export function parseServerUrl(url: string): ParsedServerUrl | null {
  const match = SERVER_URL_PATTERN.exec(url.trim());
  if (!match) return null;
  const host = match[2].toLowerCase();
  if (host.length > MAX_HOST_LENGTH || host.split(".").some((label) => label === "")) return null;
  if (match[3] !== undefined && Number(match[3]) > MAX_PORT) return null;
  return { scheme: match[1].toLowerCase() as "http" | "https", host };
}

function parseStrictIpv4(host: string): number[] | null {
  const match = IPV4_PATTERN.exec(host);
  if (!match) return null;
  const octets = match.slice(1).map((part) => (part.length > 1 && part.startsWith("0") ? Number.NaN : Number(part)));
  return octets.every((octet) => octet <= OCTET_MAX) ? octets : null;
}

/** True for RFC1918 addresses written as plain dotted decimals, and for *.local names. */
export function isPrivateHost(host: string): boolean {
  const octets = parseStrictIpv4(host);
  if (octets) {
    const [first, second] = octets;
    if (first === CLASS_A_PRIVATE) return true;
    if (first === CLASS_B_PRIVATE) return second >= CLASS_B_PRIVATE_MIN && second <= CLASS_B_PRIVATE_MAX;
    return first === CLASS_C_PRIVATE && second === CLASS_C_PRIVATE_SECOND;
  }
  return host.length > PRIVATE_NAME_SUFFIX.length && host.endsWith(PRIVATE_NAME_SUFFIX);
}

/** True when the host is a proper subdomain of a trusted public suffix. */
export function isTrustedPublicHost(host: string): boolean {
  return TRUSTED_PUBLIC_SUFFIXES.some((suffix) => host.length > suffix.length && host.endsWith(suffix));
}

/** The lowercase host of a server address, or null when it isn't a well-formed http(s) address. */
export function hostOf(url: string): string | null {
  return parseServerUrl(url)?.host ?? null;
}

function isSavedHost(host: string, savedUrls: readonly string[]): boolean {
  return savedUrls.some((saved) => hostOf(saved) === host);
}

/** True when a server address is allowed: private (http or https), else https on a trusted domain or a saved host. */
export function isTrustedServerUrl(url: string, savedUrls: readonly string[]): boolean {
  const parsed = parseServerUrl(url);
  if (!parsed) return false;
  if (isPrivateHost(parsed.host)) return true;
  if (parsed.scheme !== "https") return false;
  return isTrustedPublicHost(parsed.host) || isSavedHost(parsed.host, savedUrls);
}

/** True when an address may be stored as the public/away address: https on a trusted domain or a saved host. */
export function isTrustedPublicUrl(url: string, savedUrls: readonly string[]): boolean {
  const parsed = parseServerUrl(url);
  if (!parsed || parsed.scheme !== "https") return false;
  return isTrustedPublicHost(parsed.host) || isSavedHost(parsed.host, savedUrls);
}

/** Returns the link's server address only if it is trusted, else undefined so the saved/default ones are used. */
export function sanitizeLinkServer(server: string | undefined, savedUrls: readonly string[]): string | undefined {
  if (!server) return undefined;
  return isTrustedServerUrl(server, savedUrls) ? server.trim().replace(/\/$/, "") : undefined;
}
