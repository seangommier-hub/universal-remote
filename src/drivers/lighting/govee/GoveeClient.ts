import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";
import { fccFetch, isFccTimeout } from "../../../core/network/fccRequest";

// Govee's official local LAN Control API (confirmed 2026-09-27 against the community-published spec
// at https://gist.github.com/mtwilliams5/08ae4782063b57a9b430069044f443f6, corroborated by
// wez/govee2mqtt's docs/LAN.md and community.govee.com's "Mastering the LAN API Series: LAN API
// 101" -- not guessed) is UDP-only: multicast scan on 4001, commands to 4003, replies (when one
// exists) on 4002. Expo Go has no raw UDP socket module, the same genuine platform gap that already
// routes Kasa/Wiz/LIFX through Family Command Center instead of the phone -- see the Pi's own
// govee-client.ts / adr/0204 for the wire protocol and why Govee's fixed-reply-port behavior needed
// its own exchange helper there. This client is the same FCC-proxy shape as KasaClient.ts.
//
// Requires the user to turn on "LAN Control" per-device in the Govee Home app first (Hearth cannot
// enable it remotely) -- models that only speak Govee's cloud API (a Govee account + API key) are
// out of scope for this driver entirely (see GoveeLightDriver.ts).

const GOVEE_STATUS_PATH = "/api/integrations/hearth/govee/status";
const GOVEE_TURN_PATH = "/api/integrations/hearth/govee/turn";
const GOVEE_BRIGHTNESS_PATH = "/api/integrations/hearth/govee/brightness";
const GOVEE_COLOR_PATH = "/api/integrations/hearth/govee/color";
// Same value and same real-hardware-pattern reason as KasaClient.ts's identical constant: two UDP
// attempts a second apart on the Pi (adr/0204) plus normal round-trip time comfortably fit under this.
const FCC_REQUEST_TIMEOUT_MS = 8000;

export interface GoveeStatus {
  onOff?: boolean;
  brightness?: number;
  color?: { r: number; g: number; b: number };
  colorTemInKelvin?: number;
}

export class GoveeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/** Thrown when Family Command Center isn't paired yet -- Govee lights are reached entirely through it (see class doc), unlike a driver that could otherwise degrade to "not connected" per-device. */
export class FamilyCommandCenterNotConfiguredError extends Error {}

async function fccRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) {
    throw new FamilyCommandCenterNotConfiguredError("Family Command Center isn't paired yet — pair it first, then Govee lights can be controlled.");
  }

  let response: Response;
  try {
    response = await fccFetch(config, path, init, FCC_REQUEST_TIMEOUT_MS);
  } catch (err) {
    if (isFccTimeout(err)) {
      throw new GoveeApiError(`Family Command Center didn't respond within ${FCC_REQUEST_TIMEOUT_MS / 1000} seconds`, 0);
    }
    throw err;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // The Pi's own message (adr/0204) already distinguishes "LAN Control is off / cloud-only
    // model" from a plain unreachable-network failure -- passed straight through here rather than
    // replaced with a generic one, so the driver surfaces the real, specific reason.
    throw new GoveeApiError(body?.error ?? `Family Command Center returned ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

/** Real, current status (on/off, brightness, color) for one Govee LAN-Control light, by IP address. */
export async function getStatus(ipAddress: string): Promise<GoveeStatus> {
  return fccRequest<GoveeStatus>(`${GOVEE_STATUS_PATH}?ip=${encodeURIComponent(ipAddress)}`);
}

export async function setPower(ipAddress: string, on: boolean): Promise<void> {
  await fccRequest(GOVEE_TURN_PATH, { method: "POST", body: JSON.stringify({ ip: ipAddress, on }) });
}

/** `value` is 1-100 (Govee's own documented range); callers clamp before this point. */
export async function setBrightness(ipAddress: string, value: number): Promise<void> {
  await fccRequest(GOVEE_BRIGHTNESS_PATH, { method: "POST", body: JSON.stringify({ ip: ipAddress, value }) });
}

/** RGB mode only -- colour-temperature mode is out of scope for this driver (ADR-HEARTH-185). */
export async function setColor(ipAddress: string, r: number, g: number, b: number): Promise<void> {
  await fccRequest(GOVEE_COLOR_PATH, { method: "POST", body: JSON.stringify({ ip: ipAddress, r, g, b }) });
}
