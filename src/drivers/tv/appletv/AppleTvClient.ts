// Thin client for Family Command Center's Apple TV pairing/control relay — see that project's own
// src/lib/network/apple-tv-client.ts for the actual mechanism (drives the real `atvremote` CLI,
// postlund/pyatv, as a managed subprocess, the same pattern this project's Ps5Client.ts already
// uses for the playactor CLI).
//
// Pairing is a real, local, PIN-based HAP handshake shown on the Apple TV's own screen — no Apple
// ID or password is ever involved (verified directly against pyatv's own docs). The resulting
// credential is stored entirely in atvremote's own local config file on Family Command Center's
// filesystem; this client and Hearth's own device.config never see it, only ever an IP address.

import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

export type AppleTvPairingStatus = "awaiting_pin" | "success" | "error";

export interface AppleTvPairingStatusResponse {
  status: AppleTvPairingStatus;
  errorMessage?: string;
}

async function fccRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) {
    throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
  }
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}`, ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Family Command Center rejected the saved token." : `Family Command Center returned ${response.status}.`);
  }
  return response.json();
}

/** Talks to Family Command Center's Apple TV pairing/control relay. */
export class AppleTvClient {
  /** Starts a real local PIN-pairing handshake; the Apple TV shows an on-screen PIN once this resolves. */
  async startPairing(ipAddress: string): Promise<{ sessionId: string }> {
    return fccRequest("/api/integrations/hearth/appletv/pair/start", {
      method: "POST",
      body: JSON.stringify({ ipAddress }),
    });
  }

  /** Feeds back the PIN shown on the Apple TV's own screen. */
  async submitPin(sessionId: string, pin: string): Promise<void> {
    await fccRequest("/api/integrations/hearth/appletv/pair/pin", {
      method: "POST",
      body: JSON.stringify({ sessionId, pin }),
    });
  }

  async getPairingStatus(sessionId: string): Promise<AppleTvPairingStatusResponse> {
    return fccRequest(`/api/integrations/hearth/appletv/pair/status?sessionId=${encodeURIComponent(sessionId)}`);
  }

  /** Sends a real atvremote command using the already-paired credential Family Command Center resolves on its own. */
  async sendCommand(ipAddress: string, command: string, args: string[] = []): Promise<string> {
    const { output } = await fccRequest<{ output: string }>("/api/integrations/hearth/appletv/command", {
      method: "POST",
      body: JSON.stringify({ ipAddress, command, args }),
    });
    return output;
  }
}
