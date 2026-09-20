import { BroadlinkIrDriver, BROADLINK_IR_DRIVER_ID, BROADLINK_TEACHABLE_CAPABILITIES } from "./BroadlinkIrDriver";
import { Device } from "../../../core/types/Device";

const mockSendCode = jest.fn();
jest.mock("./BroadlinkClient", () => ({
  BroadlinkClient: jest.fn().mockImplementation(() => ({ sendCode: mockSendCode })),
}));

const device: Device = {
  id: "broadlink-1",
  name: "Living Room AC",
  category: "other",
  manufacturer: "Broadlink",
  driverId: BROADLINK_IR_DRIVER_ID,
  capabilities: ["power"],
  config: { ipAddress: "192.168.1.80", codes: { power: "26001234" } },
};

describe("BroadlinkIrDriver", () => {
  let driver: BroadlinkIrDriver;

  beforeEach(() => {
    driver = new BroadlinkIrDriver();
    mockSendCode.mockReset().mockResolvedValue(undefined);
  });

  test("declares the full teachable superset, honoring DeviceDriver's 'a specific device may support a subset' contract", () => {
    expect(driver.getCapabilities()).toEqual(BROADLINK_TEACHABLE_CAPABILITIES);
  });

  test("declares hasDynamicCapabilities so App.tsx's refreshCapabilities never overwrites a device's taught-so-far list", () => {
    expect(driver.hasDynamicCapabilities).toBe(true);
  });

  test("connect() sends no network request — nothing to verify without a real side effect (same reasoning as Xbox/PS5)", async () => {
    await driver.connect(device);
    expect(mockSendCode).not.toHaveBeenCalled();
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
  });

  test("connect() throws for a device missing an IP address, without touching the network", async () => {
    const unconfigured: Device = { ...device, config: {} };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/Broadlink config/);
    expect(mockSendCode).not.toHaveBeenCalled();
  });

  test("a taught capability sends its learned code through the hub", async () => {
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(mockSendCode).toHaveBeenCalledWith("192.168.1.80", "26001234");
    expect(result.success).toBe(true);
    expect(result.state?.lastAction).toBe("power");
  });

  test("an untaught capability fails clearly instead of sending garbage or silently no-opping", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" })).rejects.toThrow(/hasn't learned a code/);
    expect(mockSendCode).not.toHaveBeenCalled();
  });
});
