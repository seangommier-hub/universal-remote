import { Device } from "../../core/types/Device";
import { findCurrentIpByBrand, findCurrentIpByMac, findCurrentIpByName, findCurrentIpByUuid, findMacByIp } from "../../discovery/familyCommandCenterDeviceLookup";
import { brandIdOf, otherSavedDeviceIps } from "./selfHealContext";

/**
 * Finds where a device with a stale saved IP now lives: MAC, UUID, then saved name; and only for a
 * device with no MAC on file, the unique unclaimed device of its brand (ADR-HEARTH-169).
 */
export async function findMovedAddress(device: Device): Promise<string | undefined> {
  const { hwaddr, uuid } = device.config ?? {};
  if (typeof hwaddr === "string") return findCurrentIpByMac(hwaddr);
  const byIdentity = (typeof uuid === "string" ? await findCurrentIpByUuid(uuid) : undefined) ?? (await findCurrentIpByName(device.name));
  if (byIdentity) return byIdentity;
  const brandId = brandIdOf(device);
  if (!brandId) return undefined;
  return findCurrentIpByBrand(brandId, { excludeIps: otherSavedDeviceIps(device) });
}

/** Backfills `hwaddr` after a heal so the next move is caught by the precise MAC lookup. */
export async function backfillHwaddr(device: Device, freshIp: string): Promise<void> {
  if (!device.config || typeof device.config.hwaddr === "string") return;
  const discoveredMac = await findMacByIp(freshIp);
  if (discoveredMac) device.config.hwaddr = discoveredMac;
}
