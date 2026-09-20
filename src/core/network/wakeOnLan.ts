// Wake-on-LAN. Tries directly from the phone's own WiFi radio first (wakeOnLanDirect.ts, a real
// experiment using react-native-jsi-udp — see that file's own doc comment for why this is now
// believed possible at all: react-native-udp, this project's original UDP attempt, is confirmed
// broken under Expo SDK 57's mandatory New Architecture, but that's a "this one library doesn't
// work" fact, not a "phones can't do this" one — Sean, directly: "many of these huge companies
// have apps of their own so clearly the tech is there"). Falls back to relaying through Family
// Command Center (that project's own src/lib/network/wake-on-lan.ts) when direct fails — the
// device may be on a network segment the phone itself isn't joined to (an isolated Guest/IoT
// network, or the Pi's own separately-hosted AP), the same reachability gap every other relayed
// driver in this project already handles this same way.
//
// Shared by any driver that knows a device's MAC address and wants to power it on from fully off
// — LG/Samsung/Sony TVs today, potentially others later. Real Wake-on-LAN itself is one standard
// protocol regardless of brand, so this lives here rather than being duplicated per driver.

import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";
import { sendWakeOnLanDirect } from "./wakeOnLanDirect";
import { logger } from "../logging/logger";

const LOG_SCOPE = "WakeOnLan";

async function sendWakeOnLanViaRelay(macAddress: string): Promise<void> {
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

/** Sends a real Wake-on-LAN magic packet for the given MAC address — directly from the phone if
 * possible, via Family Command Center's relay otherwise. No acknowledgment exists in this
 * protocol either way — "the packet was sent" is the most honest claim available, same treatment
 * every other wake mechanism in this project gets. */
export async function sendWakeOnLan(macAddress: string): Promise<void> {
  try {
    await sendWakeOnLanDirect(macAddress);
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(LOG_SCOPE, "Direct Wake-on-LAN failed, falling back to Family Command Center's relay", { message });
  }
  await sendWakeOnLanViaRelay(macAddress);
}
