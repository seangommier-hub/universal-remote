import { FamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// The proposed VNC-relay WebSocket endpoint (ADR-HEARTH-033) — mirrors httpRelayFallback.ts's
// RELAY_PATH naming for the existing HTTP relay, just the WebSocket sibling. Not yet implemented
// on the Family Command Center's side; this is Hearth's half of a documented contract.
const VNC_RELAY_PATH = "/api/integrations/hearth/relay/vnc";

/**
 * Builds the relay's WebSocket URL for a paired Family Command Center, carrying the device's own
 * bearer token as a query parameter rather than a header — the WebSocket API (browser and React
 * Native alike) has no portable way to attach custom headers to the initial handshake, so a query
 * parameter is the standard workaround every token-authenticated WebSocket API uses. The token
 * identifies *this* paired device to the relay, which is what lets the relay grant or deny VNC
 * access per device (see ADR-HEARTH-033's "multiple phones, with permission" section).
 */
export function buildVncRelayUrl(config: FamilyCommandCenterConfig): string {
  const wsBaseUrl = config.baseUrl.replace(/^http/, "ws");
  return `${wsBaseUrl}${VNC_RELAY_PATH}?token=${encodeURIComponent(config.token)}`;
}
