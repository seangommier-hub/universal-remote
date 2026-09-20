// Wake-on-LAN, relayed through Family Command Center — see that project's own
// src/lib/network/wake-on-lan.ts for the actual magic-packet sender.
//
// Real experiment tried and reverted (2026-09-20, ADR-HEARTH-110): a direct-from-phone sender
// using react-native-jsi-udp (a real, JSI-based, New-Architecture-native UDP library) was built
// and wired in ahead of this relay, on the correct premise that "react-native-udp doesn't support
// the New Architecture" is a library-specific gap, not a real platform limitation — Sean, directly:
// "many of these huge companies have apps of their own so clearly the tech is there." That premise
// held up technically (a real candidate library exists), but the specific library did not: two
// separate, real compatibility bugs against this project's React Native 0.86.3 (an unresolvable
// RCT-Folly pod dependency, patched successfully; then a codegen'd TurboModule spec header/class
// the library actively depends on but never wires up via a package.json codegenConfig, requiring
// real reverse-engineering to fix properly) — reverted rather than continuing to sink build cycles
// into an immature (14-star) dependency. The underlying architectural direction (Hearth as the
// primary driver, Family Command Center as a reachability supplement) remains correct and worth
// revisiting with either a more mature library or a purpose-built native module later.
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
