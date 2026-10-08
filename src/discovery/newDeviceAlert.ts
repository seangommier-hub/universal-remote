import { Device } from "../core/types/Device";
import { DeviceLabels, labelKey } from "./discoveryLabels";
import { NetworkDevice } from "./discoverAll";
import { DiscoveryRow } from "./discoveryRows";
import { buildSections } from "./discoverySections";
import { NoticedDevices } from "./noticedDevices";

// ADR-HEARTH-222: which discovered devices are worth a passive "new devices found" nudge. Same rules
// as the Discover screen's "Ready to add" (recognized, online, not added, not hidden), minus the
// ones the person was already told about. Nothing here adds anything -- the nudge only points at Discover.

/** Ready-to-add devices the person has not been told about yet. */
export function findNewDevices(devices: NetworkDevice[], added: Device[], labels: DeviceLabels, noticed: NoticedDevices): DiscoveryRow[] {
  const told = new Set(noticed);
  return buildSections(devices, added, labels).ready.filter((row) => !told.has(labelKey(row.device)));
}

/** The keys to remember so these devices are not announced again. */
export function noticeKeys(rows: DiscoveryRow[]): string[] {
  return rows.map((row) => labelKey(row.device));
}

/** "1 new device found on your network" / "3 new devices found on your network". */
export function newDevicesMessage(count: number): string {
  return `${count} new ${count === 1 ? "device" : "devices"} found on your network`;
}

/** Screen-reader text for the Devices tab while it carries the count badge. */
export function newDevicesTabLabel(count: number): string {
  return count > 0 ? `Devices, ${count} new ${count === 1 ? "device" : "devices"} found` : "Devices";
}
