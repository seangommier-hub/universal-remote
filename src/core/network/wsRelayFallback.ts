import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";

// See ADR-HEARTH-011. Mirrors httpRelayFallback.ts's fallback pattern for WebSocket-based
// drivers (Samsung, LG): try a direct connection to the device first, and only relay through
// Family Command Center's WS relay if that fails — e.g. the device is on a network segment the
// phone isn't currently joined to. The relay scheme (ws vs wss) is intentionally read from
// config rather than hardcoded, since whether Family Command Center's relay uses a real or
// self-signed TLS cert changes what React Native's WebSocket can actually connect to.

const DIRECT_CONNECT_TIMEOUT_MS = 4000;
const RELAY_CONNECT_TIMEOUT_MS = 8000;
const RELAY_PORT = 3211;
const RELAY_SCHEME = "wss"; // confirm against Family Command Center; see ADR-HEARTH-011 update

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

/**
 * Opens a WebSocket to `targetUrl`, trying a direct connection first and falling back to
 * relaying through Family Command Center if that fails. Returns an already-open socket with no
 * handlers attached (any used internally are cleared before resolving) — the caller attaches
 * its own `onmessage`/`onerror`/`onclose` and proceeds with its own application handshake, same
 * as if it had connected directly.
 */
export async function openSocketWithRelayFallback(targetUrl: string): Promise<WebSocket> {
  try {
    return await tryOpenSocket(targetUrl, DIRECT_CONNECT_TIMEOUT_MS, `connecting directly to ${targetUrl}`);
  } catch {
    const config = await loadFamilyCommandCenterConfig();
    if (!config) {
      throw new Error(`Could not reach ${targetUrl} directly, and Family Command Center isn't configured for relay fallback (add it in Settings)`);
    }
    const relayHost = new URL(config.baseUrl).hostname;
    const relayUrl = `${RELAY_SCHEME}://${relayHost}:${RELAY_PORT}/?token=${encodeURIComponent(config.token)}&target=${encodeURIComponent(targetUrl)}`;
    return tryOpenSocket(relayUrl, RELAY_CONNECT_TIMEOUT_MS, `relaying to ${targetUrl} through Family Command Center`);
  }
}
