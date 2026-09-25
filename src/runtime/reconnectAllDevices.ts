import { logger } from "../core/logging/logger";
import { Device } from "../core/types/Device";
import { HearthRuntime } from "./bootstrap";

const LOG_SCOPE = "reconnectAllDevices";

/**
 * Brings every device back after the app returns to the foreground, the network changes, or on
 * startup. A driver that can cheaply prove its live connection still works (isConnectionAlive,
 * ADR-HEARTH-138) is left alone when it does: reconnecting a healthy LG tore down its working socket
 * and left it unusable for several seconds on every return to the app. Everything else reconnects
 * as before. `onConnected` runs after each successful connect (App.tsx re-saves the device there,
 * since a driver may have just learned a pairing key).
 */
export async function reconnectAllDevices(runtime: HearthRuntime, devices: Device[], onConnected: (device: Device) => void): Promise<void> {
  await Promise.all(
    devices.map(async (device) => {
      const driver = runtime.driverRegistry.get(device.driverId);
      try {
        if (driver?.isConnectionAlive && (await driver.isConnectionAlive(device))) return;
        await driver?.connect(device);
        onConnected(device);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(LOG_SCOPE, `Could not reconnect ${device.name}`, { message });
      }
    })
  );
}
