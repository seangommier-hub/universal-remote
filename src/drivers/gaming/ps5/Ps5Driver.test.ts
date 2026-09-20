import { Ps5Driver } from "./Ps5Driver";
import { Device } from "../../../core/types/Device";

const mockSendWake = jest.fn();
jest.mock("./Ps5Client", () => ({
  Ps5Client: jest.fn().mockImplementation(() => ({ sendWake: mockSendWake })),
}));

const device: Device = {
  id: "ps5-1",
  name: "Living Room PS5",
  category: "gaming",
  manufacturer: "Sony",
  driverId: "ps5-ddp",
  capabilities: [],
  config: { ipAddress: "192.168.1.214" },
};

describe("Ps5Driver", () => {
  let driver: Ps5Driver;

  beforeEach(() => {
    driver = new Ps5Driver();
    mockSendWake.mockReset().mockResolvedValue(undefined);
  });

  test("declares only powerOn — media control and power-off need a full authenticated session this driver doesn't implement", () => {
    expect(driver.getCapabilities()).toEqual(["powerOn"]);
  });

  test("connect() sends no network request — probing an off console has no side-effect-free mechanism", async () => {
    await driver.connect(device);
    expect(mockSendWake).not.toHaveBeenCalled();
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
  });

  test("connect() throws for a device missing an IP address, without touching the network", async () => {
    const unconfigured: Device = { ...device, config: {} };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/PS5 config/);
    expect(mockSendWake).not.toHaveBeenCalled();
  });

  test("powerOn sends the wake with just the console's IP — no credentials object needed", async () => {
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "powerOn" });

    expect(mockSendWake).toHaveBeenCalledWith("192.168.1.214");
    expect(result.success).toBe(true);
    expect(result.state?.lastAction).toBe("powerOn");
  });

  test("any other capability throws — this driver only ever implements powerOn", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/does not implement/);
    expect(mockSendWake).not.toHaveBeenCalled();
  });
});
