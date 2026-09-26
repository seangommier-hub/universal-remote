import { Device } from "../../../core/types/Device";
import { getPilot, setPilot } from "./WizClient";
import { WIZ_LIGHT_DRIVER_ID, WizLightDriver } from "./WizLightDriver";

jest.mock("../../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));
jest.mock("./WizClient", () => ({ ...jest.requireActual("./WizClient"), getPilot: jest.fn(), setPilot: jest.fn() }));
jest.mock("../../../discovery/familyCommandCenterDeviceLookup", () => ({ findCurrentIpByMac: jest.fn(), findCurrentIpByName: jest.fn(async () => null), findMacByIp: jest.fn() }));

const mockGetPilot = getPilot as jest.Mock;
const mockSetPilot = setPilot as jest.Mock;

const device: Device = { id: "wiz-1", name: "Lamp", category: "lighting", manufacturer: "Wiz", driverId: WIZ_LIGHT_DRIVER_ID, capabilities: [], config: { ipAddress: "192.168.1.89" } };

describe("WizLightDriver", () => {
  let driver: WizLightDriver;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = new WizLightDriver();
    mockGetPilot.mockResolvedValue({ state: true, dimming: 60, r: 255, g: 0, b: 0 });
    mockSetPilot.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await driver.disconnect(device);
  });

  test("declares power, brightness and colour", () => {
    expect(driver.getCapabilities()).toEqual(["power", "setBrightness", "setColor"]);
  });

  test("connect() reads power, brightness and converts red/green/blue to hue and saturation", async () => {
    await driver.connect(device);

    expect((await driver.getState(device)).values).toEqual({ power: "on", brightness: 60, hue: 0, saturation: 100 });
  });

  test("a bulb in white mode reports no colour instead of a made-up one", async () => {
    mockGetPilot.mockResolvedValue({ state: false, dimming: 30 });

    await driver.connect(device);

    expect((await driver.getState(device)).values).toEqual({ power: "off", brightness: 30 });
  });

  test("power turns an on bulb off and an off bulb on", async () => {
    await driver.connect(device);
    mockGetPilot.mockResolvedValue({ state: false });
    await driver.executeCommand(device, { deviceId: "wiz-1", capability: "power" });
    expect(mockSetPilot).toHaveBeenLastCalledWith("192.168.1.89", { state: false });

    await driver.executeCommand(device, { deviceId: "wiz-1", capability: "power" });
    expect(mockSetPilot).toHaveBeenLastCalledWith("192.168.1.89", { state: true });
  });

  test("setBrightness clamps to the bulb's 10-100 range and turns the bulb on", async () => {
    await driver.connect(device);

    await driver.executeCommand(device, { deviceId: "wiz-1", capability: "setBrightness", args: { brightness: 3 } });
    expect(mockSetPilot).toHaveBeenLastCalledWith("192.168.1.89", { state: true, dimming: 10 });

    await driver.executeCommand(device, { deviceId: "wiz-1", capability: "setBrightness", args: { brightness: 150 } });
    expect(mockSetPilot).toHaveBeenLastCalledWith("192.168.1.89", { state: true, dimming: 100 });
  });

  test("setColor converts hue and saturation to red/green/blue", async () => {
    await driver.connect(device);

    await driver.executeCommand(device, { deviceId: "wiz-1", capability: "setColor", args: { hue: 240, saturation: 100 } });

    expect(mockSetPilot).toHaveBeenLastCalledWith("192.168.1.89", { state: true, r: 0, g: 0, b: 255 });
  });

  test("a missing argument is rejected without touching the network or the connection state", async () => {
    await driver.connect(device);
    mockSetPilot.mockClear();

    await expect(driver.executeCommand(device, { deviceId: "wiz-1", capability: "setColor", args: { hue: 10 } })).rejects.toThrow(/'saturation'/);

    expect(mockSetPilot).not.toHaveBeenCalled();
    expect((await driver.getState(device)).connection).toBe("connected");
  });

  test("an unreachable bulb marks the driver disconnected", async () => {
    await driver.connect(device);
    mockSetPilot.mockRejectedValue(new Error("relay down"));

    await expect(driver.executeCommand(device, { deviceId: "wiz-1", capability: "power" })).rejects.toThrow("relay down");

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });
});
