import { mockSamsungTvDriver } from "./samsung/MockSamsungTvDriver";
import { mockLgTvDriver } from "./lg/MockLgTvDriver";
import { Device } from "../../core/types/Device";
import { DeviceDriver } from "../../core/drivers/DeviceDriver";

const samsungTv: Device = {
  id: "samsung-1",
  name: "Samsung TV",
  category: "tv",
  manufacturer: "Samsung",
  driverId: mockSamsungTvDriver.id,
  capabilities: mockSamsungTvDriver.getCapabilities(),
};

const lgTv: Device = {
  id: "lg-1",
  name: "LG TV",
  category: "tv",
  manufacturer: "LG",
  driverId: mockLgTvDriver.id,
  capabilities: mockLgTvDriver.getCapabilities(),
};

describe.each<[string, DeviceDriver, Device]>([
  ["Samsung", mockSamsungTvDriver, samsungTv],
  ["LG", mockLgTvDriver, lgTv],
])("%s mock TV driver (proves the shared abstraction)", (_name, driver, device) => {
  test("connect() initializes a known default state", async () => {
    await driver.connect(device);
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.power).toBe("off");
  });

  test("power command toggles state and reports success", async () => {
    await driver.connect(device);
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });
    expect(result.success).toBe(true);
    expect(result.state?.power).toBe("on");
  });

  test(
    "volumeUp/volumeDown clamp between 0 and 100",
    async () => {
      await driver.connect(device);
      // Default volume is 20, step is 2: 45 ups clears the 100 ceiling, 55 downs clears the 0 floor.
      for (let i = 0; i < 45; i++) {
        await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });
      }
      const maxed = await driver.getState(device);
      expect(maxed.values.volume).toBe(100);

      for (let i = 0; i < 55; i++) {
        await driver.executeCommand(device, { deviceId: device.id, capability: "volumeDown" });
      }
      const floored = await driver.getState(device);
      expect(floored.values.volume).toBe(0);
    },
    20000
  );

  test("subscribeToState notifies listeners on command execution, and unsubscribe stops it", async () => {
    await driver.connect(device);
    const seen: unknown[] = [];
    const unsubscribe = driver.subscribeToState(device, (_id, state) => seen.push(state.values.power));

    await driver.executeCommand(device, { deviceId: device.id, capability: "power" });
    expect(seen).toContain("on");

    unsubscribe();
    const countBeforeExtra = seen.length;
    await driver.executeCommand(device, { deviceId: device.id, capability: "power" });
    expect(seen.length).toBe(countBeforeExtra);
  });
});

describe("Manufacturer-specific capability differences", () => {
  test("Samsung mock supports channel capabilities that LG mock does not", () => {
    expect(mockSamsungTvDriver.getCapabilities()).toContain("channelUp");
    expect(mockLgTvDriver.getCapabilities()).not.toContain("channelUp");
  });
});

describe("Input validation", () => {
  test("setVolume without a numeric arg throws (CommandEngine converts this to driver_error)", async () => {
    await mockSamsungTvDriver.connect(samsungTv);
    await expect(
      mockSamsungTvDriver.executeCommand(samsungTv, { deviceId: samsungTv.id, capability: "setVolume" })
    ).rejects.toThrow();
  });

  test("inputSelection without a string arg throws", async () => {
    await mockSamsungTvDriver.connect(samsungTv);
    await expect(
      mockSamsungTvDriver.executeCommand(samsungTv, { deviceId: samsungTv.id, capability: "inputSelection" })
    ).rejects.toThrow();
  });
});
