import { DeviceDriver } from "../../../core/drivers/DeviceDriver";
import { Device } from "../../../core/types/Device";
import { finishPairing, startPairingOnAnyPort } from "./VizioClient";
import { VIZIO_SMARTCAST_DRIVER_ID } from "./VizioSmartCastDriver";

/** What the first pairing step learned: which port answered and the token to send back with the PIN. */
export interface VizioPairingStart {
  ipAddress: string;
  port: number;
  pairingToken: number;
}

const DEFAULT_NAME = "Vizio TV";

/** Step 1: makes the TV show a PIN on screen. */
export async function beginVizioPairing(ipAddress: string): Promise<VizioPairingStart> {
  const { port, pairingToken } = await startPairingOnAnyPort(ipAddress);
  return { ipAddress, port, pairingToken };
}

/** Step 2: trades the on-screen PIN for a saved token, proves it by connecting, and returns the ready-to-save device. */
export async function completeVizioPairing(driver: DeviceDriver, start: VizioPairingStart, pin: string, name: string): Promise<Device> {
  const authToken = await finishPairing(start.ipAddress, start.port, start.pairingToken, pin);
  const device: Device = {
    id: `vizio-${Date.now()}`,
    name: name.trim() || DEFAULT_NAME,
    category: "tv",
    manufacturer: "Vizio",
    driverId: VIZIO_SMARTCAST_DRIVER_ID,
    capabilities: driver.getCapabilities(),
    config: { ipAddress: start.ipAddress, port: start.port, authToken },
  };
  try {
    await driver.connect(device);
  } catch (error) {
    driver.disconnect(device).catch(() => {});
    throw error;
  }
  return device;
}
