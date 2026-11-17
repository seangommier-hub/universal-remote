import { FamilyCommandCenterConfig, loadFamilyCommandCenterConfigSafely } from "../../discovery/familyCommandCenterConfig";
import {
  recordLanFailure,
  recordPublicFailure,
  recordRouteSuccess,
  resetConnectivityForTests,
  shouldPreferPublicRoute,
  shouldSkipDirectAttempt,
} from "./fccConnectivity";

// See ADR-HEARTH-011. Mirrors httpRelayFallback.ts's fallback pattern for WebSocket-based
// drivers (Samsung, LG): try a direct connection to the device first, and only relay through
// Family Command Center's WS relay if that fails — e.g. the device is on a network segment the
// phone isn't currently joined to. Confirmed with Family Command Center: the relay is plain
// ws:// (a `ws` package WebSocketServer with no TLS underneath) — an internal LAN hop where the
// query-string token is the real auth boundary, same reasoning as why the devices themselves
// use unencrypted ws:// locally (ADR-HEARTH-005/006).

const DIRECT_CONNECT_TIMEOUT_MS = 4000;
const RELAY_CONNECT_TIMEOUT_MS = 8000;
// ADR-HEARTH-137: a device whose direct socket failed (LG/Samsung use self-signed wss that iOS refuses,
// or the device sits on another network segment) fails it the same way every time, so retrying it first
// on every connect/pointer-socket open just added up to 4s of lag before the relay. Remember the failure
// for the app session and skip straight to the relay, re-trying direct only occasionally.
const DIRECT_RETRY_AFTER_MS = 10 * 60 * 1000;
const directFailedAt = new Map<string, number>();

function directKey(targetUrl: string): string {
  try {
    return new URL(targetUrl).host;
  } catch {
    return targetUrl;
  }
}

/** Test-only: forgets which devices failed a direct connection. */
export function resetDirectFailureMemoryForTests(): void {
  directFailedAt.clear();
  resetConnectivityForTests();
}

// ADR-HEARTH-234: Family Command Center's WS relay accepts the socket first and only then validates
// it, so a refusal arrives as a close with one of these codes (scripts/hearth-relay/relay-ws-server.js
// on the Family Command Center side) rather than as a failed open. A driver's handshake that ignores
// the close just waits out its own timeout and blames the TV's pairing instead.
export class RelayRefusedError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = "RelayRefusedError";
  }
}

const RELAY_CLOSE_MESSAGES: Record<number, string> = {
  4001: "Family Command Center rejected this phone's saved token — re-verify the connection in Settings > Family Command Center",
  4003: "Family Command Center doesn't see this TV at its saved address — the TV may be off its network or have moved",
  4004: "Family Command Center won't relay to this TV's port",
  4008: "Family Command Center couldn't reach the TV — it may be off, asleep, or off its Wi-Fi network",
  1011: "Family Command Center's relay hit an internal error",
};

/**
 * Turns a close that arrives *before* a driver's handshake finished into a real error: a
 * `RelayRefusedError` naming the cause for the relay's own refusal codes, otherwise a plain error
 * saying the connection dropped before the TV answered (not a pairing problem).
 */
export function describeHandshakeClose(event: { code?: number; reason?: string } | undefined, target: string): Error {
  const code = event?.code ?? 0;
  const known = RELAY_CLOSE_MESSAGES[code];
  if (known) return new RelayRefusedError(known, code);
  const reason = event?.reason ? ` (${event.reason})` : "";
  return new Error(`The connection to ${target} closed before the TV answered${reason} — the TV may be off, asleep, or unreachable from Family Command Center`);
}

const RELAY_PORT = 3211;
const RELAY_SCHEME = "ws";

function tryOpenSocket(url: string, timeoutMs: number, failureContext: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.onopen = null;
      socket.onerror = null;
      socket.close();
      reject(new Error(`Timed out ${failureContext}`));
    }, timeoutMs);

    socket.onopen = () => {
      clearTimeout(timeout);
      socket.onopen = null;
      socket.onerror = null;
      resolve(socket);
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      socket.onopen = null;
      socket.onerror = null;
      reject(new Error(`Could not open a WebSocket while ${failureContext}`));
    };
  });
}

// Real ask (2026-09-21, ADR-HEARTH-123): "this should be something that can still be used even
// when off network." The Cloudflare Tunnel this derives from provisions hearth-relay.<domain>
// (HTTP) and hearth-ws.<domain> (this WS relay) together, always as a matched pair (ADR-HEARTH-123
// on the Family Command Center side) — deriving the WS host from the HTTP publicBaseUrl by this
// naming convention means Sean only ever has to configure one public URL in Settings, not two.
function publicRelayHost(publicBaseUrl: string): string {
  return new URL(publicBaseUrl).hostname.replace(/^hearth-relay\./, "hearth-ws.");
}

function buildRelayUrl(scheme: string, host: string, port: number | undefined, token: string, targetUrl: string): string {
  const authority = port ? `${host}:${port}` : host;
  return `${scheme}://${authority}/?token=${encodeURIComponent(token)}&target=${encodeURIComponent(targetUrl)}`;
}

async function openViaLanRelay(config: FamilyCommandCenterConfig, targetUrl: string): Promise<WebSocket> {
  const lanRelayUrl = buildRelayUrl(RELAY_SCHEME, new URL(config.baseUrl).hostname, RELAY_PORT, config.token, targetUrl);
  try {
    const socket = await tryOpenSocket(lanRelayUrl, RELAY_CONNECT_TIMEOUT_MS, `relaying to ${targetUrl} through Family Command Center`);
    recordRouteSuccess("lan");
    return socket;
  } catch (err) {
    recordLanFailure();
    throw err;
  }
}

// wss:// on the tunnel's public hostname, no explicit port -- Cloudflare terminates TLS on 443 and
// forwards to the LAN relay's real port internally (ADR-HEARTH-123).
async function openViaPublicRelay(publicBaseUrl: string, token: string, targetUrl: string): Promise<WebSocket> {
  const publicRelayUrl = buildRelayUrl("wss", publicRelayHost(publicBaseUrl), undefined, token, targetUrl);
  try {
    const socket = await tryOpenSocket(publicRelayUrl, RELAY_CONNECT_TIMEOUT_MS, `relaying to ${targetUrl} through Family Command Center's public tunnel`);
    recordRouteSuccess("public");
    return socket;
  } catch (err) {
    // 2026-10-05: this used to just propagate with no recordPublicFailure() call -- the LG/Samsung
    // WS path (this file) is exactly how Sean saw "Reachable through the relay only" during a real
    // outage where the relay was actually down (fccConnectivity.ts has the full story).
    recordPublicFailure();
    throw err;
  }
}

/** Tries the LAN relay then the public one (public first while away from home, ADR-HEARTH-147); rejects with the last failure. */
async function openViaFccRelays(config: FamilyCommandCenterConfig, targetUrl: string): Promise<WebSocket> {
  const lan = () => openViaLanRelay(config, targetUrl);
  const { publicBaseUrl } = config;
  if (!publicBaseUrl) return lan();
  const viaPublic = () => openViaPublicRelay(publicBaseUrl, config.token, targetUrl);
  const [first, second] = shouldPreferPublicRoute() ? [viaPublic, lan] : [lan, viaPublic];
  try {
    return await first();
  } catch {
    return second();
  }
}

/**
 * Opens a WebSocket to `targetUrl`, trying a direct connection first, then Family Command
 * Center's LAN relay, then — only if that also fails and a public URL is configured (away from
 * the home WiFi, the expected state) — the same relay reached through its public Cloudflare
 * Tunnel hostname over `wss://` instead of the LAN's plain `ws://`. Returns an already-open
 * socket with no handlers attached (any used internally are cleared before resolving) — the
 * caller attaches its own `onmessage`/`onerror`/`onclose` and proceeds with its own application
 * handshake, same as if it had connected directly.
 */
export async function openSocketWithRelayFallback(targetUrl: string): Promise<WebSocket> {
  const key = directKey(targetUrl);
  const failedAt = directFailedAt.get(key);
  const skipDirect =
    (failedAt !== undefined && Date.now() - failedAt < DIRECT_RETRY_AFTER_MS) || shouldSkipDirectAttempt(directKey(targetUrl).split(":")[0]);
  try {
    if (skipDirect) throw new Error("direct connection skipped: it failed recently, or the phone is away from home");
    const direct = await tryOpenSocket(targetUrl, DIRECT_CONNECT_TIMEOUT_MS, `connecting directly to ${targetUrl}`);
    directFailedAt.delete(key);
    return direct;
  } catch {
    // ADR-HEARTH-232: must be the Keychain-safe loader — a locked/backgrounded phone otherwise
    // throws a raw KeyChainException here instead of falling into the "not configured" branch
    // below, failing every relay-fallback connection attempt made while the phone is locked.
    const config = await loadFamilyCommandCenterConfigSafely();
    if (!config) {
      throw new Error(`Could not reach ${targetUrl} directly, and Family Command Center isn't configured for relay fallback (add it in Settings)`);
    }
    let viaRelay: WebSocket;
    try {
      viaRelay = await openViaFccRelays(config, targetUrl);
    } catch (err) {
      directFailedAt.delete(key); // the relay could not help either: try direct again next time
      throw err;
    }
    directFailedAt.set(key, failedAt !== undefined && skipDirect ? failedAt : Date.now());
    return viaRelay;
  }
}
