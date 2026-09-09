import { Device } from "../types/Device";

/** Holds the devices the user has paired into their household. In-memory for now; persistence is a later roadmap item. */
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
