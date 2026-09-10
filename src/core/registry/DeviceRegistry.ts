import { Device } from "../types/Device";

/** Holds the devices the user has paired into their household, in memory. Actual persistence across app launches (SecureStore + AsyncStorage) lives in src/runtime/persistence.ts and is applied at App.tsx's startup/add/remove call sites — this registry itself has no disk awareness. */
export class DeviceRegistry {
  private devices = new Map<string, Device>();

  add(device: Device): void {
    this.devices.set(device.id, device);
  }

  remove(deviceId: string): void {
    this.devices.delete(deviceId);
  }

  get(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  list(): Device[] {
    return Array.from(this.devices.values());
  }
}
