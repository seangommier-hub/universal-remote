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
// 2026-10-05: mode only ever moves forward on a SUCCESS (see recordRouteSuccess) -- it never had a
// way to notice the public/relay route failing again after once succeeding. That left
// deriveRemoteViewState.ts with nothing real to check, so it hardcoded fccReachable to `true`
// whenever mode wasn't "unknown" (describeDeviceStatus.ts's "relay isn't answering" branch was
// consequently dead code from any real call site, only reachable in its own unit tests). A device
// stuck on "away" from an earlier successful relay connection kept showing "Reachable through the
// relay only" even while the relay (and the whole Pi it runs on) was fully down -- confirmed live,
// 2026-10-05, Sean: "downstairs saying only reachable through relay" during a real Pi outage where
// hearth-relay.*/hearth-ws.* both answered 502. publicFailedAt mirrors lanFailedAt so that case has
// a real signal to report instead of an assumption.
let publicFailedAt: number | undefined;
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

/** Records that the public tunnel/relay could not be reached. */
export function recordPublicFailure(now: number = Date.now()): void {
  publicFailedAt = now;
}

/** Records which route just succeeded; a public success after a LAN failure means away, a LAN success means home. */
export function recordRouteSuccess(route: FccRoute): void {
  if (route === "lan") {
    lanFailedAt = undefined;
    setMode("home");
  } else {
    publicFailedAt = undefined;
    if (lanFailedAt !== undefined) setMode("away");
  }
}

/** True once the public/relay route has failed more recently than it last succeeded -- i.e. being
 * in "away" mode no longer means the relay is actually answering right now, just that it did at
 * some point this app session. Undefined signals (fccReachable) should read this as "not proven
 * reachable", not "proven unreachable", which is why deriveRemoteViewState.ts negates it rather
 * than treating "never failed" and "never tried" the same. */
export function isPublicRouteCurrentlyFailing(): boolean {
  return publicFailedAt !== undefined;
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
  publicFailedAt = undefined;
  listeners.clear();
}
