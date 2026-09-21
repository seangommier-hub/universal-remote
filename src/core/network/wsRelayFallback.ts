import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";

// See ADR-HEARTH-011. Mirrors httpRelayFallback.ts's fallback pattern for WebSocket-based
// drivers (Samsung, LG): try a direct connection to the device first, and only relay through
// Family Command Center's WS relay if that fails — e.g. the device is on a network segment the
// phone isn't currently joined to. Confirmed with Family Command Center: the relay is plain
// ws:// (a `ws` package WebSocketServer with no TLS underneath) — an internal LAN hop where the
// query-string token is the real auth boundary, same reasoning as why the devices themselves
// use unencrypted ws:// locally (ADR-HEARTH-005/006).

const DIRECT_CONNECT_TIMEOUT_MS = 4000;
const RELAY_CONNECT_TIMEOUT_MS = 8000;
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
  try {
    return await tryOpenSocket(targetUrl, DIRECT_CONNECT_TIMEOUT_MS, `connecting directly to ${targetUrl}`);
  } catch {
    const config = await loadFamilyCommandCenterConfig();
    if (!config) {
      throw new Error(`Could not reach ${targetUrl} directly, and Family Command Center isn't configured for relay fallback (add it in Settings)`);
    }
    const lanRelayUrl = buildRelayUrl(RELAY_SCHEME, new URL(config.baseUrl).hostname, RELAY_PORT, config.token, targetUrl);
    try {
      return await tryOpenSocket(lanRelayUrl, RELAY_CONNECT_TIMEOUT_MS, `relaying to ${targetUrl} through Family Command Center`);
    } catch (err) {
      if (!config.publicBaseUrl) throw err;
      // wss:// on the tunnel's public hostname, no explicit port -- Cloudflare terminates TLS on
      // 443 and forwards to the LAN relay's real port internally (ADR-HEARTH-123).
      const publicRelayUrl = buildRelayUrl("wss", publicRelayHost(config.publicBaseUrl), undefined, config.token, targetUrl);
      return tryOpenSocket(publicRelayUrl, RELAY_CONNECT_TIMEOUT_MS, `relaying to ${targetUrl} through Family Command Center's public tunnel`);
    }
  }
}
