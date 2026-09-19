// Thin client for the PS4/PS5 "Device Discovery Protocol" (DDP) wake mechanism — relayed through
// Family Command Center (see that project's src/lib/network/ps5-client.ts for the actual DDP wire
// protocol and its own doc comment for the two reference implementations it was verified against).
//
// Real-device finding (2026-09-19): this used to talk UDP directly from the phone via
// react-native-udp, the same library SsdpDiscoveryProvider.ts uses. Live on Sean's iPhone, that
// crashed immediately ("cannot read createSocket of null") — react-native-udp (dormant since
// January 2023) never added support for React Native's "New Architecture", which Expo SDK 57
// makes mandatory with no opt-out. Rather than chase an unverified New-Architecture-compatible UDP
// library (the one candidate found, react-native-udp-turbo, is explicitly Android-only right
// now), the whole DDP mechanism moved server-side — same reasoning that already put Xbox's own
// power-on packet through Family Command Center (XboxDriver.ts). A second, independent reason this
// specifically suits the pairing step: capturing credentials needs Sean to background Hearth to
// open the real PlayStation App, and iOS does not reliably keep a backgrounded app's own socket
// (or even a single in-flight fetch) alive for however long that takes — a real always-on server
// process has no such concern at all, so pairing is poll-based (start a session, then poll its
// status every couple seconds) rather than one long-held phone-side request.

import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

export interface Ps5Credentials {
  clientType: string;
  authType: string;
  userCredential: string;
}

type Ps5PairingStatus = "pending" | "found" | "timeout" | "error";

interface Ps5PairingStatusResponse {
  status: Ps5PairingStatus;
  credentials?: Ps5Credentials;
  errorMessage?: string;
}

const POLL_INTERVAL_MS = 2000;
// A bit past Family Command Center's own 120s capture timeout, so its own "timeout" status is
// what actually ends the wait, not this client giving up first.
const POLL_MAX_ATTEMPTS = 65;

export class Ps5PairingTimeoutError extends Error {}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
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

/** Talks to Family Command Center's PS5 DDP relay. */
export class Ps5Client {
  /**
   * Starts a capture session on Family Command Center and polls its status until a real
   * credential arrives, the session times out, or `signal` is aborted. `onListening` fires once
   * the session has genuinely started (the server socket is bound), so the UI can tell the user
   * it's safe to switch to the PlayStation App now.
   */
  async captureCredentials(deviceName: string, onListening: () => void, signal?: AbortSignal): Promise<Ps5Credentials> {
    const { sessionId } = await fccRequest<{ sessionId: string }>("/api/integrations/hearth/ps5/pair/start", {
      method: "POST",
      body: JSON.stringify({ deviceName }),
    });
    onListening();

    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS, signal);
      if (signal?.aborted) throw new Error("Cancelled");

      const status = await fccRequest<Ps5PairingStatusResponse>(`/api/integrations/hearth/ps5/pair/status?sessionId=${encodeURIComponent(sessionId)}`);
      if (status.status === "found" && status.credentials) return status.credentials;
      if (status.status === "timeout") {
        throw new Ps5PairingTimeoutError("Timed out waiting for the PlayStation App to send credentials — open it and tap the device that appeared, then try again");
      }
      if (status.status === "error") {
        throw new Error(status.errorMessage || "Pairing failed on Family Command Center");
      }
      // "pending" — keep polling.
    }
    throw new Ps5PairingTimeoutError("Timed out waiting for the PlayStation App to send credentials — open it and tap the device that appeared, then try again");
  }

  /** Sends one real wake request via Family Command Center — no reply exists in this protocol, so
   * "the packet was sent" is the most honest claim available, same treatment as XboxDriver's own
   * power-on. */
  async sendWake(ipAddress: string, credentials: Ps5Credentials): Promise<void> {
    await fccRequest("/api/integrations/hearth/ps5/poweron", {
      method: "POST",
      body: JSON.stringify({ ipAddress, credentials }),
    });
  }
}
