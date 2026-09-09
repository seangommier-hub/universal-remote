import { DeviceDriver } from "./DeviceDriver";

/** Looks up the driver instance responsible for a device by driver id. Registration happens once at app startup. */
export class DriverRegistry {
  private drivers = new Map<string, DeviceDriver>();

  register(driver: DeviceDriver): void {
    this.drivers.set(driver.id, driver);
  }

  get(driverId: string): DeviceDriver | undefined {
    return this.drivers.get(driverId);
  }

  list(): DeviceDriver[] {
    return Array.from(this.drivers.values());
  }
}
