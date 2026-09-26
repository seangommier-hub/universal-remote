import { fccJsonRequest } from "../../../core/network/fccJsonRequest";

// Wiz bulbs speak JSON over UDP port 38899 (`{"method":"getPilot"}` -> `{"result":{...}}`). The
// phone has no working UDP socket on iOS (react-native-udp does not support the New Architecture,
// see SsdpDiscoveryProvider.ts), so this is the same Family Command Center proxy shape as
// KasaClient.ts: the Pi sends the datagram and returns the bulb's own reply (ADR-HEARTH-165). The
// getPilot/setPilot field names follow the community pywizlight client; unverified on a real bulb.

const WIZ_RELAY_PATH = "/api/integrations/hearth/wiz/request";
export const WIZ_MIN_DIMMING = 10;
export const WIZ_MAX_DIMMING = 100;

export interface WizPilot {
  state?: boolean;
  dimming?: number;
  r?: number;
  g?: number;
  b?: number;
  mac?: string;
}

export interface WizPilotChange {
  state?: boolean;
  dimming?: number;
  r?: number;
  g?: number;
  b?: number;
}

interface WizReply {
  result?: WizPilot & { success?: boolean };
  error?: { code?: number; message?: string };
}

export class WizApiError extends Error {}

async function wizRequest(ipAddress: string, method: "getPilot" | "setPilot", params?: WizPilotChange): Promise<WizReply["result"]> {
  const reply = await fccJsonRequest<WizReply>(WIZ_RELAY_PATH, { method: "POST", body: JSON.stringify({ ip: ipAddress, method, params }) });
  if (reply.error) throw new WizApiError(`The Wiz bulb refused the request: ${reply.error.message ?? reply.error.code ?? "unknown error"}`);
  if (!reply.result) throw new WizApiError("The Wiz bulb sent no answer");
  return reply.result;
}

/** The bulb's live state: on/off, brightness and colour. */
export async function getPilot(ipAddress: string): Promise<WizPilot> {
  return (await wizRequest(ipAddress, "getPilot")) ?? {};
}

/** Changes the bulb's state; rejects when the bulb says it did not apply it. */
export async function setPilot(ipAddress: string, change: WizPilotChange): Promise<void> {
  const result = await wizRequest(ipAddress, "setPilot", change);
  if (result?.success === false) throw new WizApiError("The Wiz bulb did not apply the change");
}
