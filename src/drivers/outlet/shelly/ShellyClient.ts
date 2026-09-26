import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

// Shelly relays and plugs answer plain HTTP on port 80 with no pairing (ADR-HEARTH-165).
//  - Gen1: GET /relay/<n> -> {"ison":true}; GET /relay/<n>?turn=on|off  (Shelly Gen1 HTTP API)
//  - Gen2/3/4 ("Plus", "Pro"): GET /rpc/Switch.GetStatus?id=<n> -> {"output":true};
//    GET /rpc/Switch.Set?id=<n>&on=true|false  (Shelly Gen2+ RPC API)
//  - GET /shelly answers on every generation; only Gen2+ includes a numeric "gen" field.
// A device with its login switched on answers 401 and is reported as such rather than guessed at.
// Shapes written from Shelly's published API docs and not yet tried against a real device.

const SHELLY_PORT = 80;
const GEN1 = 1;
const HTTP_UNAUTHORIZED = 401;

export type ShellyGeneration = 1 | 2;

export interface ShellyIdentity {
  generation: ShellyGeneration;
  model?: string;
  name?: string;
  mac?: string;
}

export class ShellyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function shellyGet(ipAddress: string, path: string): Promise<unknown> {
  const response = await requestWithRelayFallback({ ip: ipAddress, port: SHELLY_PORT, path, method: "GET" });
  if (response.status === HTTP_UNAUTHORIZED) {
    throw new ShellyApiError("The Shelly has its login turned on. Turn it off in the Shelly app or the device's web page so Hearth can reach it.", response.status);
  }
  if (!response.ok) throw new ShellyApiError(`The Shelly at ${ipAddress} answered with HTTP ${response.status}`, response.status);
  return response.json();
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Works out which generation of Shelly this is, plus its model and its own name when it has one. */
export async function identifyShelly(ipAddress: string): Promise<ShellyIdentity> {
  const info = (await shellyGet(ipAddress, "/shelly")) as Record<string, unknown>;
  const gen = typeof info.gen === "number" && info.gen > GEN1;
  return {
    generation: gen ? 2 : 1,
    model: stringOrUndefined(gen ? info.model : info.type),
    name: gen ? stringOrUndefined(info.name) : undefined,
    mac: stringOrUndefined(info.mac),
  };
}

/** True when the relay on this channel is on. */
export async function readRelay(ipAddress: string, generation: ShellyGeneration, channel: number): Promise<boolean> {
  if (generation === GEN1) {
    const status = (await shellyGet(ipAddress, `/relay/${channel}`)) as { ison?: unknown };
    if (typeof status.ison !== "boolean") throw new ShellyApiError("The Shelly did not report its relay state", 0);
    return status.ison;
  }
  const status = (await shellyGet(ipAddress, `/rpc/Switch.GetStatus?id=${channel}`)) as { output?: unknown };
  if (typeof status.output !== "boolean") throw new ShellyApiError("The Shelly did not report its relay state", 0);
  return status.output;
}

/** Switches the relay on this channel on or off. */
export async function writeRelay(ipAddress: string, generation: ShellyGeneration, channel: number, on: boolean): Promise<void> {
  const path = generation === GEN1 ? `/relay/${channel}?turn=${on ? "on" : "off"}` : `/rpc/Switch.Set?id=${channel}&on=${on}`;
  await shellyGet(ipAddress, path);
}
