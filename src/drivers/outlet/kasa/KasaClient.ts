import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

// TP-Link Kasa's local control protocol is a raw TCP socket with its own binary framing (port
// 9999, legacy XOR "encryption" -- see family-command-center's kasa-client.ts for the full,
// source-verified spec) -- not something Expo Go can speak at all (no raw socket module), the
// same genuine platform gap that already routes LG's SSAP WebSocket and Xbox's SmartGlass UDP
// broadcast through Family Command Center instead of the phone. This client is the same
// FCC-proxy shape as SmartThingsClient.ts, reused here for a different underlying protocol.

const KASA_SYSINFO_PATH = "/api/integrations/hearth/kasa/sysinfo";
const KASA_SET_RELAY_STATE_PATH = "/api/integrations/hearth/kasa/set-relay-state";
// Same value and same real-hardware-pattern reason as SmartThingsClient.ts's identical constant.
const FCC_REQUEST_TIMEOUT_MS = 8000;

export interface KasaSysInfo {
  relayState?: boolean;
  alias?: string;
  model?: string;
}

export class KasaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/** Thrown when Family Command Center isn't paired yet -- Kasa plugs are reached entirely through it (see class doc), unlike a driver that could otherwise degrade to "not connected" per-device. */
export class FamilyCommandCenterNotConfiguredError extends Error {}

async function fccRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) {
    throw new FamilyCommandCenterNotConfiguredError("Family Command Center isn't paired yet — pair it first, then Kasa plugs can be controlled.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FCC_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new KasaApiError(`Family Command Center didn't respond within ${FCC_REQUEST_TIMEOUT_MS / 1000} seconds`, 0);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new KasaApiError(body?.error ?? `Family Command Center returned ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

/** Real, current relay state for one Kasa plug, by IP address. */
export async function getSysInfo(ipAddress: string): Promise<KasaSysInfo> {
  return fccRequest<KasaSysInfo>(`${KASA_SYSINFO_PATH}?ip=${encodeURIComponent(ipAddress)}`);
}

export async function setRelayState(ipAddress: string, on: boolean): Promise<void> {
  await fccRequest(KASA_SET_RELAY_STATE_PATH, {
    method: "POST",
    body: JSON.stringify({ ip: ipAddress, state: on ? "on" : "off" }),
  });
}
