// Thin client for Family Command Center's PS5 pairing/wake relay — see that project's
// src/lib/network/ps5-client.ts for the actual mechanism (a real PSN OAuth login plus the
// console's own Remote Play "Link Device" PIN registration, driven through the real `playactor`
// CLI) and its own doc comment for why this needs a household member's real PSN login rather than
// the credential-free approach originally attempted here.
//
// Real-hardware finding (2026-09-19): the original design (impersonate a standby console, capture
// a broadcast credential) never worked against a real PS5 — confirmed by real PS5 owners that the
// PS5 doesn't support the old broadcast-discovery mechanism the PS4 did at all. The real, working
// flow needs three separate steps a Hearth screen has to walk the user through interactively:
// open a real PSN login link, paste back the post-login redirect URL, then enter an 8-digit PIN
// from the console's own screen — hence the multi-call shape below instead of one "pair" call.

import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

export type Ps5LoginStatus = "awaiting_redirect" | "awaiting_pin" | "success" | "error";

export interface Ps5LoginStatusResponse {
  status: Ps5LoginStatus;
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

/** Talks to Family Command Center's PS5 pairing/wake relay. */
export class Ps5Client {
  /** Starts a real PSN login flow on Family Command Center; resolves with a real Sony login URL to open. */
  async startLogin(ipAddress: string): Promise<{ sessionId: string; loginUrl: string }> {
    return fccRequest("/api/integrations/hearth/ps5/login/start", {
      method: "POST",
      body: JSON.stringify({ ipAddress }),
    });
  }

  /** Feeds back the URL the household member copied from their browser after completing the real PSN login. */
  async submitRedirectUrl(sessionId: string, redirectUrl: string): Promise<void> {
    await fccRequest("/api/integrations/hearth/ps5/login/redirect", {
      method: "POST",
      body: JSON.stringify({ sessionId, redirectUrl }),
    });
  }

  /** Feeds back the 8-digit PIN from the console's own Settings > System > Remote Play > Link Device screen. */
  async submitPin(sessionId: string, pin: string): Promise<void> {
    await fccRequest("/api/integrations/hearth/ps5/login/pin", {
      method: "POST",
      body: JSON.stringify({ sessionId, pin }),
    });
  }

  async getLoginStatus(sessionId: string): Promise<Ps5LoginStatusResponse> {
    return fccRequest(`/api/integrations/hearth/ps5/login/status?sessionId=${encodeURIComponent(sessionId)}`);
  }

  /** Sends a real wake command — Family Command Center resolves the console's already-registered credential on its own, so this only ever needs the IP. */
  async sendWake(ipAddress: string): Promise<void> {
    await fccRequest("/api/integrations/hearth/ps5/poweron", {
      method: "POST",
      body: JSON.stringify({ ipAddress }),
    });
  }
}
