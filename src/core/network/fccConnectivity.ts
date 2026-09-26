// Remembers whether this phone last reached Family Command Center over the home LAN or only via
// its public tunnel (ADR-HEARTH-147), so away from home every request does not pay a doomed LAN
// timeout first. In-memory only: it resets on app restart and is re-proven by real traffic.

export type ConnectivityMode = "home" | "away" | "unknown";
export type FccRoute = "lan" | "public";

/** How long after a failed LAN attempt requests go straight to the public tunnel before the LAN is probed again. */
export const AWAY_MEMORY_MS = 5 * 60 * 1000;

const PRIVATE_172_SECOND_OCTET_MIN = 16;
const PRIVATE_172_SECOND_OCTET_MAX = 31;
const IPV4_OCTET_COUNT = 4;

let mode: ConnectivityMode = "unknown";
let lanFailedAt: number | undefined;
const listeners = new Set<(mode: ConnectivityMode) => void>();

function setMode(next: ConnectivityMode): void {
  if (next === mode) return;
  mode = next;
  listeners.forEach((listener) => listener(next));
}

/** Read-only: "away" once the LAN failed but the public tunnel worked, "home" once the LAN answered, else "unknown". */
export function getConnectivityMode(): ConnectivityMode {
  return mode;
}

/** Calls back whenever the connectivity mode changes; returns an unsubscribe function. */
export function subscribeConnectivityMode(listener: (mode: ConnectivityMode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while requests should skip the LAN address and use the public tunnel first (away, and the LAN failed recently). */
export function shouldPreferPublicRoute(now: number = Date.now()): boolean {
  return mode === "away" && lanFailedAt !== undefined && now - lanFailedAt < AWAY_MEMORY_MS;
}

/** Records that the LAN address could not be reached. */
export function recordLanFailure(now: number = Date.now()): void {
  lanFailedAt = now;
}

/** Records which route just succeeded; a public success after a LAN failure means away, a LAN success means home. */
export function recordRouteSuccess(route: FccRoute): void {
  if (route === "lan") {
    lanFailedAt = undefined;
    setMode("home");
  } else if (lanFailedAt !== undefined) {
    setMode("away");
  }
}

/** True for RFC 1918 private addresses, which a phone away from home can never reach directly. */
export function isPrivateLanHost(host: string): boolean {
  const octets = host.split(".").map(Number);
  if (octets.length !== IPV4_OCTET_COUNT || octets.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = octets;
  if (first === 10 || (first === 192 && second === 168)) return true;
  return first === 172 && second >= PRIVATE_172_SECOND_OCTET_MIN && second <= PRIVATE_172_SECOND_OCTET_MAX;
}

/** True when a direct attempt to this host is pointless because the phone is away and the host is a private LAN address. */
export function shouldSkipDirectAttempt(host: string): boolean {
  return mode === "away" && isPrivateLanHost(host);
}

/** Test-only: forgets the remembered route. */
export function resetConnectivityForTests(): void {
  mode = "unknown";
  lanFailedAt = undefined;
  listeners.clear();
}
