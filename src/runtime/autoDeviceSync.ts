import { Device } from "../core/types/Device";
import { logger } from "../core/logging/logger";
import { fetchSharedDevices, publishDevices } from "../discovery/familyCommandCenterDeviceSync";
import { selectDevicesToImport } from "./selectDevicesToImport";

const LOG_SCOPE = "autoDeviceSync";

/**
 * Keeps every household phone's device list converged without any taps (ADR-HEARTH-131): adds
 * whatever the shared list has that this phone lacks, then publishes the union back so the other
 * phones get anything only this one had. Additive only — a removed device can reappear from another
 * phone. Never throws: with no Family Command Center saved, or it unreachable, it just does nothing.
 */
export async function runAutoDeviceSync(localDevices: Device[], addDevice: (device: Device) => void): Promise<void> {
  try {
    const shared = await fetchSharedDevices();
    const toImport = selectDevicesToImport(shared, localDevices);
    toImport.forEach(addDevice);
    const union = [...localDevices, ...toImport];
    const sharedIds = new Set(shared.map((d) => d.id));
    const hasNewForOthers = union.some((d) => !sharedIds.has(d.id));
    if (union.length > 0 && hasNewForOthers) await publishDevices(union);
    if (toImport.length > 0) logger.info(LOG_SCOPE, `Added ${toImport.length} device(s) from the household list`);
  } catch (err) {
    logger.debug(LOG_SCOPE, "Skipped device sync", { message: err instanceof Error ? err.message : String(err) });
  }
}
