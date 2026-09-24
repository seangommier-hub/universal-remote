import { Device } from "../core/types/Device";

function normalizedHwaddr(device: Device): string | undefined {
  const hwaddr = device.config?.hwaddr;
  return typeof hwaddr === "string" ? hwaddr.toLowerCase() : undefined;
}

/** Picks the shared devices this phone doesn't already have, matched by id or hardware address, so importing never overwrites a local rename or duplicates a device. */
export function selectDevicesToImport(shared: Device[], local: Device[]): Device[] {
  const localIds = new Set(local.map((d) => d.id));
  const localHwaddrs = new Set(local.map(normalizedHwaddr).filter((h): h is string => h !== undefined));
  return shared.filter((device) => {
    if (localIds.has(device.id)) return false;
    const hwaddr = normalizedHwaddr(device);
    return hwaddr === undefined || !localHwaddrs.has(hwaddr);
  });
}
