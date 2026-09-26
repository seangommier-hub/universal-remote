import { DeviceDriver } from "../core/drivers/DeviceDriver";
import { Device } from "../core/types/Device";
import { AndroidTvClient, AndroidTvPairingStart, ANDROID_TV_PAIRING_CODE_PATTERN } from "../drivers/tv/androidtv/AndroidTvClient";
import { ANDROID_TV_DRIVER_ID } from "../drivers/tv/androidtv/AndroidTvDriver";
import { getBrand } from "./brandRegistry";

// ADR-HEARTH-168: the framework-free steps behind the Google TV / Android TV pairing screen, so the
// code normalisation and the "pair, then save the TV's own MAC for Wake-on-LAN" logic are tested
// without React. The screen wraps confirmAndroidTvPairing in a PairingSession (ADR-HEARTH-155).

/** Upper-cases and trims what the person typed; null unless it is exactly 6 hexadecimal characters. */
export function normalizePairingCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return ANDROID_TV_PAIRING_CODE_PATTERN.test(code) ? code : null;
}

export interface ConfirmAndroidTvPairingInput {
  client: AndroidTvClient;
  driver: DeviceDriver;
  start: AndroidTvPairingStart;
  code: string;
  ipAddress: string;
  /** The name the person typed; the TV's own name is used when it is blank. */
  name: string;
}

/** Submits the code, then builds the device (with the MAC the TV reported) and connects it to prove control works. */
export async function confirmAndroidTvPairing(input: ConfirmAndroidTvPairingInput): Promise<Device> {
  const { client, driver, start, code, ipAddress, name } = input;
  const paired = await client.finishPairing(start.sessionId, code);
  const brand = getBrand("androidtv");
  const mac = paired.mac || start.mac;
  const device: Device = {
    id: `androidtv-${Date.now()}`,
    name: name.trim() || paired.name || start.name || brand.defaultName,
    category: brand.category,
    manufacturer: brand.manufacturer,
    driverId: ANDROID_TV_DRIVER_ID,
    capabilities: driver.getCapabilities(),
    config: { ipAddress, ...(mac ? { hwaddr: mac.toLowerCase().replace(/-/g, ":") } : {}) },
  };
  await driver.connect(device);
  return device;
}
