import { Device } from "../../../core/types/Device";
import { getLifxState, setLifxColor, setLifxPower } from "./LifxClient";
import { LIFX_LIGHT_DRIVER_ID, LifxLightDriver } from "./LifxLightDriver";

jest.mock("../../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));
jest.mock("./LifxClient");
jest.mock("../../../discovery/familyCommandCenterDeviceLookup", () => ({ findCurrentIpByMac: jest.fn(), findCurrentIpByBrand: jest.fn(async () => undefined), findCurrentIpByName: jest.fn(async () => null), findMacByIp: jest.fn() }));

const mockGetState = getLifxState as jest.Mock;
const mockSetPower = setLifxPower as jest.Mock;
const mockSetColor = setLifxColor as jest.Mock;

const device: Device = { id: "lifx-1", name: "Desk", category: "lighting", manufacturer: "LIFX", driverId: LIFX_LIGHT_DRIVER_ID, capabilities: [], config: { ipAddress: "192.168.1.91" } };

describe("LifxLightDriver", () => {
  let driver: LifxLightDriver;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = new LifxLightDriver();
    mockGetState.mockResolvedValue({ power: true, hue: 120, saturation: 100, brightness: 80, label: "Desk lamp" });
    mockSetPower.mockResolvedValue(undefined);
    mockSetColor.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await driver.disconnect(device);
  });

  test("declares power, brightness and colour", () => {
    expect(driver.getCapabilities()).toEqual(["power", "setBrightness", "setColor"]);
  });

  test("connect() reads power, colour and the bulb's own label as the suggested name", async () => {
    await driver.connect(device);

    expect((await driver.getState(device)).values).toEqual({ power: "on", brightness: 80, hue: 120, saturation: 100, deviceName: "Desk lamp" });
  });

  test("power toggles from the last known state", async () => {
    await driver.connect(device);

    await driver.executeCommand(device, { deviceId: "lifx-1", capability: "power" });

    expect(mockSetPower).toHaveBeenCalledWith("192.168.1.91", false);
  });

  test("setBrightness changes only brightness, then makes sure the bulb is on", async () => {
    await driver.connect(device);

    await driver.executeCommand(device, { deviceId: "lifx-1", capability: "setBrightness", args: { brightness: 35 } });

    expect(mockSetColor).toHaveBeenCalledWith("192.168.1.91", { brightness: 35 });
    expect(mockSetPower).toHaveBeenCalledWith("192.168.1.91", true);
  });

  test("setColor sends hue and saturation only, and clamps out-of-range values", async () => {
    await driver.connect(device);

    await driver.executeCommand(device, { deviceId: "lifx-1", capability: "setColor", args: { hue: 400, saturation: 50 } });

    expect(mockSetColor).toHaveBeenCalledWith("192.168.1.91", { hue: 360, saturation: 50 });
  });

  test("a non-numeric brightness is rejected before any network call", async () => {
    await driver.connect(device);

    await expect(driver.executeCommand(device, { deviceId: "lifx-1", capability: "setBrightness", args: { brightness: "high" } })).rejects.toThrow(/numeric 'brightness'/);

    expect(mockSetColor).not.toHaveBeenCalled();
    expect((await driver.getState(device)).connection).toBe("connected");
  });

  test("an unreachable bulb marks the driver disconnected", async () => {
    await driver.connect(device);
    mockSetPower.mockRejectedValue(new Error("relay down"));

    await expect(driver.executeCommand(device, { deviceId: "lifx-1", capability: "power" })).rejects.toThrow("relay down");

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });
});
