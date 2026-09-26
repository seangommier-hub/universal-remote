import { Device } from "../../../core/types/Device";
import { identifyShelly, readRelay, writeRelay } from "./ShellyClient";
import { SHELLY_RELAY_DRIVER_ID, ShellyRelayDriver } from "./ShellyRelayDriver";

jest.mock("../../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));
jest.mock("./ShellyClient");
jest.mock("../../../discovery/familyCommandCenterDeviceLookup", () => ({ findCurrentIpByMac: jest.fn(), findCurrentIpByName: jest.fn(async () => null), findMacByIp: jest.fn() }));

const mockIdentify = identifyShelly as jest.Mock;
const mockRead = readRelay as jest.Mock;
const mockWrite = writeRelay as jest.Mock;

function makeDevice(config: Record<string, unknown> = {}): Device {
  return { id: "shelly-1", name: "Porch", category: "outlet", manufacturer: "Shelly", driverId: SHELLY_RELAY_DRIVER_ID, capabilities: [], config: { ipAddress: "192.168.1.92", ...config } };
}

describe("ShellyRelayDriver", () => {
  let driver: ShellyRelayDriver;
  let device: Device;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = new ShellyRelayDriver();
    device = makeDevice();
    mockIdentify.mockResolvedValue({ generation: 2, model: "SNSW-001X16EU", name: "Porch light", mac: "AABBCCDDEEFF" });
    mockRead.mockResolvedValue(true);
    mockWrite.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await driver.disconnect(device);
  });

  test("declares only power", () => {
    expect(driver.getCapabilities()).toEqual(["power"]);
  });

  test("first connect identifies the generation, saves it and the MAC, and surfaces model and name", async () => {
    await driver.connect(device);

    expect(device.config).toMatchObject({ generation: 2, hwaddr: "AABBCCDDEEFF" });
    expect((await driver.getState(device)).values).toEqual({ power: "on", model: "SNSW-001X16EU", deviceName: "Porch light" });
  });

  test("a device with a saved generation is not asked to identify itself again", async () => {
    device = makeDevice({ generation: 1 });

    await driver.connect(device);

    expect(mockIdentify).not.toHaveBeenCalled();
    expect(mockRead).toHaveBeenCalledWith("192.168.1.92", 1, 0);
  });

  test("power writes the opposite of the last known state and reports what the relay confirms", async () => {
    await driver.connect(device);
    mockRead.mockResolvedValue(false);

    const result = await driver.executeCommand(device, { deviceId: "shelly-1", capability: "power" });

    expect(mockWrite).toHaveBeenCalledWith("192.168.1.92", 2, 0, false);
    expect(result.state?.power).toBe("off");
  });

  test("a relay that ignores the command is reported as its real state", async () => {
    await driver.connect(device);

    const result = await driver.executeCommand(device, { deviceId: "shelly-1", capability: "power" });

    expect(result.state?.power).toBe("on");
  });

  test("a configured channel is used for reads and writes", async () => {
    device = makeDevice({ generation: 2, channel: 1 });

    await driver.connect(device);
    await driver.executeCommand(device, { deviceId: "shelly-1", capability: "power" });

    expect(mockRead).toHaveBeenCalledWith("192.168.1.92", 2, 1);
    expect(mockWrite).toHaveBeenCalledWith("192.168.1.92", 2, 1, false);
  });

  test("a capability other than power is rejected", async () => {
    await expect(driver.executeCommand(device, { deviceId: "shelly-1", capability: "setBrightness", args: { brightness: 5 } })).rejects.toThrow(/does not implement/);
  });

  test("a failed write marks the driver disconnected", async () => {
    await driver.connect(device);
    mockWrite.mockRejectedValue(new Error("unreachable"));

    await expect(driver.executeCommand(device, { deviceId: "shelly-1", capability: "power" })).rejects.toThrow("unreachable");

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });
});
