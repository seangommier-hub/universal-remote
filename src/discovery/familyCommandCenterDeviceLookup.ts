import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// Real-hardware finding (2026-09-10): a device's saved IP goes stale the moment it moves to a
// different WiFi network/VLAN — common in real households (confirmed with Sean directly: "i have
// multiple wifi types in my house and other people do too"), not a one-off edge case. The Family
// Command Center's own device inventory (ADR-HEARTH-010) already tracks every LAN device by MAC
// address alongside its current IP, since it scans the network directly — this re-uses that same
// endpoint FamilyCommandCenterDiscoveryProvider already calls, as a single-device lookup instead
// of a full scan, so a driver can "find myself again" after a network change.

const LOOKUP_TIMEOUT_MS = 8000;

interface LanDevice {
  hwaddr: string;
  ip: string;
  name: string | null;
}

async function fetchLanDevices(): Promise<LanDevice[] | undefined> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}/api/integrations/hearth/devices`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const { devices } = (await response.json()) as { devices: LanDevice[] };
    return devices;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Looks up a device's *current* IP address by its MAC address, via the Family Command Center's
 * device inventory. Returns `undefined` (never throws for "not found") if the Center isn't
 * configured, the request fails, or no device with that MAC is currently known — callers should
 * treat that as "couldn't re-locate it," not a hard error, and fall back to their existing retry
 * behavior.
 */
export async function findCurrentIpByMac(hwaddr: string): Promise<string | undefined> {
  const devices = await fetchLanDevices();
  return devices?.find((device) => device.hwaddr.toLowerCase() === hwaddr.toLowerCase())?.ip;
}

/**
 * The reverse lookup: given an IP address, finds the MAC address the Family Command Center
 * currently sees at it. Used to backfill `hwaddr` onto a device that was paired manually (typed
 * IP, no MAC on file) once it's known to be reachable at a specific address — so a device fixed
 * by hand once can still self-heal automatically the *next* time its IP goes stale, instead of
 * needing a human to fix it by hand forever. Same "never throws for not found" contract as
 * `findCurrentIpByMac`.
 */
export async function findMacByIp(ip: string): Promise<string | undefined> {
  const devices = await fetchLanDevices();
  return devices?.find((device) => device.ip === ip)?.hwaddr;
}

/**
 * Looks up a device's current IP by its DHCP hostname instead of its MAC — the fallback for a
 * device that has no `hwaddr` on file at all.
 *
 * Real-hardware finding (2026-09-10), live during Sean's "reconnect still isn't working" report:
 * a device added via Family Command Center discovery *before* `hwaddr` started being saved
 * (`DiscoverDevicesScreen.tsx`, ADR-HEARTH-017) has no MAC recorded and can never be re-discovered
 * by `findCurrentIpByMac`, no matter how many failure types that function is taught to react to —
 * there's simply nothing to look up with. But that same discovery flow already sets the device's
 * `name` to the Center's own reported hostname (`FamilyCommandCenterDiscoveryProvider.ts`:
 * `name: device.name ?? device.ip`), which is exactly what the Center's inventory is keyed on too
 * — so a hostname match serves the identical purpose for exactly this legacy case. Same
 * "never throws for not found" contract as the MAC lookups; a device whose name was later
 * changed via Hearth's own rename feature, or that never matches, just finds nothing.
 */
export async function findCurrentIpByName(name: string): Promise<string | undefined> {
  const devices = await fetchLanDevices();
  return devices?.find((device) => device.name?.toLowerCase() === name.toLowerCase())?.ip;
}
