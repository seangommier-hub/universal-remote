import { Device } from "../core/types/Device";
import { findDuplicateDevice } from "../discovery/deviceIdentityMatch";

/** Picks the shared devices this phone doesn't already have, matched by id or stable identity (MAC, UUID, serial), so importing never overwrites a local rename or duplicates a device. */
export function selectDevicesToImport(shared: Device[], local: Device[]): Device[] {
  const localIds = new Set(local.map((d) => d.id));
  return shared.filter((device) => !localIds.has(device.id) && findDuplicateDevice(device, local) === undefined);
}
