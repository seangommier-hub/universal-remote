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

import { fccJsonRequest } from "../../../core/network/fccJsonRequest";
import { LONG_FETCH_TIMEOUT_MS } from "../../../core/network/fetchWithTimeout";

/** How often and how many times each PS5 pairing step's status is polled. */
export const PS5_PAIRING_POLL_INTERVAL_MS = 1500;
export const PS5_PAIRING_POLL_MAX_ATTEMPTS = 20;

export type Ps5LoginStatus = "awaiting_redirect" | "awaiting_pin" | "success" | "error";

export interface Ps5LoginStatusResponse {
  status: Ps5LoginStatus;
  errorMessage?: string;
}

async function fccRequest<T>(path: string, init?: RequestInit, timeoutMs: number = LONG_FETCH_TIMEOUT_MS): Promise<T> {
  return fccJsonRequest<T>(path, init, timeoutMs);
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
