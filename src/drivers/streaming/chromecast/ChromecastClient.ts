// Thin client for Chromecast's "CastV2" control protocol — relayed through Family Command Center
// (see that project's src/lib/network/chromecast-client.ts for the actual Protobuf/TLS wire
// protocol and its own doc comment for the primary source it was verified against).
//
// Built server-side from the start, unlike PS5/SSDP earlier the same day (both started
// phone-native and had to move here after react-native-udp crashed live under Expo SDK 57's
// mandatory New Architecture). The one real candidate for a phone-native TCP+TLS socket here,
// `react-native-tcp-socket`, has an open, unanswered GitHub issue asking about New Architecture
// support and no codegen/TurboModule markers in its own package.json — the same category of
// unresolved risk that already cost real time today with its sibling `react-native-udp`. Not
// worth gambling on without a live test this session doesn't have time to run through a full EAS
// rebuild cycle first, so this goes through Family Command Center unconditionally.

import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

export interface ChromecastStatus {
  volumeLevel: number; // 0.0-1.0, the protocol's own native scale
  muted: boolean;
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

/** Talks to Family Command Center's Chromecast relay. */
export class ChromecastClient {
  async getStatus(ipAddress: string): Promise<ChromecastStatus> {
    return fccRequest<ChromecastStatus>("/api/integrations/hearth/chromecast/status", {
      method: "POST",
      body: JSON.stringify({ ipAddress }),
    });
  }

  /** `level` is the protocol's own native 0.0-1.0 scale, not a 0-100 percentage. */
  async setVolume(ipAddress: string, level: number): Promise<ChromecastStatus> {
    return fccRequest<ChromecastStatus>("/api/integrations/hearth/chromecast/volume", {
      method: "POST",
      body: JSON.stringify({ ipAddress, level }),
    });
  }

  async setMute(ipAddress: string, muted: boolean): Promise<ChromecastStatus> {
    return fccRequest<ChromecastStatus>("/api/integrations/hearth/chromecast/volume", {
      method: "POST",
      body: JSON.stringify({ ipAddress, muted }),
    });
  }
}
