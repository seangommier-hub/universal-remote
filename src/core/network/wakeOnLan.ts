// Wake-on-LAN, relayed through Family Command Center — see that project's own
// src/lib/network/wake-on-lan.ts for the actual magic-packet sender and its doc comment for why
// this runs server-side rather than in this app directly (react-native-udp, the only real
// phone-native UDP option, does not support Expo SDK 57's mandatory New Architecture — confirmed
// broken live the same day this was built, via the PS5/SSDP work).
//
// Shared by any driver that knows a device's MAC address and wants to power it on from fully off
// — LG/Samsung/Sony TVs today, potentially others later. Real Wake-on-LAN itself is one standard
// protocol regardless of brand, so this lives here rather than being duplicated per driver.

import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";

/** Sends a real Wake-on-LAN magic packet for the given MAC address via Family Command Center. No
 * acknowledgment exists in this protocol — "the packet was sent" is the most honest claim
 * available, same treatment every other wake mechanism in this project gets. */
export async function sendWakeOnLan(macAddress: string): Promise<void> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) {
    throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
  }
  const response = await fetch(`${config.baseUrl}/api/integrations/hearth/wake-on-lan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ macAddress }),
  });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Family Command Center rejected the saved token." : `Family Command Center returned ${response.status}.`);
  }
}
