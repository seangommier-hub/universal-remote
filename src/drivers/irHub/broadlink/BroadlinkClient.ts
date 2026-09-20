// Thin client for Family Command Center's Broadlink IR/RF hub relay — see that project's own
// src/lib/network/broadlink-client.ts for the actual mechanism (drives the real python-broadlink
// library, mjg59/python-broadlink, as a managed subprocess, the same pattern this project's
// Ps5Client.ts already uses for the playactor CLI).
//
// Unlike every other paired driver in this project, there is no pairing/auth step here at all: a
// Broadlink hub that's already on the household WiFi (set up once via the official Broadlink/
// e-control app, out of scope for Hearth) accepts a fresh local handshake on every command, so
// this client only ever needs the hub's IP address — no PSK, client-key, or token to store.

import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

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

/** Talks to Family Command Center's Broadlink IR/RF hub relay. */
export class BroadlinkClient {
  /** Puts the hub into learning mode and waits for a real remote button press, resolving with the captured code as a hex string. */
  async learnCode(hubIpAddress: string): Promise<string> {
    const { code } = await fccRequest<{ code: string }>("/api/integrations/hearth/broadlink/learn", {
      method: "POST",
      body: JSON.stringify({ ipAddress: hubIpAddress }),
    });
    return code;
  }

  /** Transmits a previously-learned code (from learnCode) through the hub. */
  async sendCode(hubIpAddress: string, code: string): Promise<void> {
    await fccRequest("/api/integrations/hearth/broadlink/send", {
      method: "POST",
      body: JSON.stringify({ ipAddress: hubIpAddress, code }),
    });
  }
}
