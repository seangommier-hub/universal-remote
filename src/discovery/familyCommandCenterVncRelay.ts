import { FamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// The VNC-relay WebSocket endpoint (ADR-HEARTH-033). Originally specced as a path on the Family
// Command Center's own Next.js app (same host+port as config.baseUrl) — corrected once the Family
// Command Center side was actually built: `next start` doesn't expose the HTTP Upgrade event to
// application code, the exact same limitation that forced the Samsung/LG WS relay
// (wsRelayFallback.ts, ADR-HEARTH-011) onto its own standalone process and port rather than a
// Next.js route. This mirrors that proven pattern exactly: same hostname as config.baseUrl, a
// dedicated port for the relay process, plain ws:// (the query-string token is the real auth
// boundary, same reasoning wsRelayFallback.ts documents for the TV relay).
const VNC_RELAY_PORT = 3212;
const RELAY_SCHEME = "ws";

/**
 * Builds the relay's WebSocket URL for a paired Family Command Center, carrying the device's own
 * bearer token as a query parameter rather than a header — the WebSocket API (browser and React
 * Native alike) has no portable way to attach custom headers to the initial handshake, so a query
 * parameter is the standard workaround every token-authenticated WebSocket API uses. The token
 * identifies *this* paired device to the relay, which is what lets the relay grant or deny VNC
 * access per device (see ADR-HEARTH-033's "multiple phones, with permission" section).
 */
export function buildVncRelayUrl(config: FamilyCommandCenterConfig): string {
  const relayHost = new URL(config.baseUrl).hostname;
  return `${RELAY_SCHEME}://${relayHost}:${VNC_RELAY_PORT}/?token=${encodeURIComponent(config.token)}`;
}

/**
 * Real ask (2026-09-21, ADR-HEARTH-125): "this should be something that can still be used even
 * when off network" — extends the same public-tunnel fallback the TV relays already have
 * (ADR-HEARTH-123) to this screen. `hearth-vnc.<domain>` is provisioned as part of the same
 * matched hostname set as `hearth-relay.`/`hearth-ws.` (adr/0182 on the Family Command Center
 * side), so it's derived from `publicBaseUrl` by the identical naming convention
 * wsRelayFallback.ts already established — no separate Settings field needed. `wss://`, no
 * explicit port: Cloudflare terminates TLS on 443 and forwards to the LAN relay's real port
 * internally. Returns undefined when no public URL is configured, so callers know there's nothing
 * left to try.
 */
export function buildPublicVncRelayUrl(config: FamilyCommandCenterConfig): string | undefined {
  if (!config.publicBaseUrl) return undefined;
  const host = new URL(config.publicBaseUrl).hostname.replace(/^hearth-relay\./, "hearth-vnc.");
  return `wss://${host}/?token=${encodeURIComponent(config.token)}`;
}
