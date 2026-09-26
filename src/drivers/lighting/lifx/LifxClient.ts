import { fccJsonRequest } from "../../../core/network/fccJsonRequest";

// LIFX's LAN protocol is a binary UDP protocol on port 56700. The phone has no working UDP socket
// on iOS (see SsdpDiscoveryProvider.ts), so, like KasaClient.ts, this asks Family Command Center to
// speak it and hand back plain JSON (ADR-HEARTH-165). The Pi owns the binary framing and the
// unit conversion: hue 0-360, saturation and brightness 0-100. Unverified against a real bulb.

const LIFX_STATE_PATH = "/api/integrations/hearth/lifx/state";
const LIFX_SET_POWER_PATH = "/api/integrations/hearth/lifx/set-power";
const LIFX_SET_COLOR_PATH = "/api/integrations/hearth/lifx/set-color";

export interface LifxState {
  power?: boolean;
  hue?: number;
  saturation?: number;
  brightness?: number;
  label?: string;
}

/** A partial colour change; anything left out keeps the bulb's current value (the Pi fills it in). */
export interface LifxColorChange {
  hue?: number;
  saturation?: number;
  brightness?: number;
}

/** The bulb's live state by IP address. */
export async function getLifxState(ipAddress: string): Promise<LifxState> {
  return fccJsonRequest<LifxState>(`${LIFX_STATE_PATH}?ip=${encodeURIComponent(ipAddress)}`);
}

/** Turns the bulb on or off. */
export async function setLifxPower(ipAddress: string, on: boolean): Promise<void> {
  await fccJsonRequest(LIFX_SET_POWER_PATH, { method: "POST", body: JSON.stringify({ ip: ipAddress, on }) });
}

/** Changes hue, saturation and/or brightness. */
export async function setLifxColor(ipAddress: string, change: LifxColorChange): Promise<void> {
  await fccJsonRequest(LIFX_SET_COLOR_PATH, { method: "POST", body: JSON.stringify({ ip: ipAddress, ...change }) });
}
