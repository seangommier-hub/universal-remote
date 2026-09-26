// Thin client for Family Command Center's Broadlink IR/RF hub relay — see that project's own
// src/lib/network/broadlink-client.ts for the actual mechanism (drives the real python-broadlink
// library, mjg59/python-broadlink, as a managed subprocess, the same pattern this project's
// Ps5Client.ts already uses for the playactor CLI).
//
// Unlike every other paired driver in this project, there is no pairing/auth step here at all: a
// Broadlink hub that's already on the household WiFi (set up once via the official Broadlink/
// e-control app, out of scope for Hearth) accepts a fresh local handshake on every command, so
// this client only ever needs the hub's IP address — no PSK, client-key, or token to store.

import { fccJsonRequest } from "../../../core/network/fccJsonRequest";
import { DEFAULT_FETCH_TIMEOUT_MS } from "../../../core/network/fetchWithTimeout";

// Learning mode waits for a person to walk over and press a real remote button, so it gets far more
// headroom than an ordinary relay call — but still a bounded amount.
const LEARN_TIMEOUT_MS = 60000;

async function fccRequest<T>(path: string, init?: RequestInit, timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS): Promise<T> {
  return fccJsonRequest<T>(path, init, timeoutMs);
}

/** Talks to Family Command Center's Broadlink IR/RF hub relay. */
export class BroadlinkClient {
  /** Puts the hub into learning mode and waits for a real remote button press, resolving with the captured code as a hex string. */
  async learnCode(hubIpAddress: string): Promise<string> {
    const { code } = await fccRequest<{ code: string }>("/api/integrations/hearth/broadlink/learn", {
      method: "POST",
      body: JSON.stringify({ ipAddress: hubIpAddress }),
    }, LEARN_TIMEOUT_MS);
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
