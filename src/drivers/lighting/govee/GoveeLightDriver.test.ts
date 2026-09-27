import { GOVEE_LIGHT_DRIVER_ID, GoveeLightDriver } from "./GoveeLightDriver";
import { Device } from "../../../core/types/Device";
import { getStatus, setBrightness, setColor, setPower } from "./GoveeClient";
import { findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../../discovery/familyCommandCenterDeviceLookup";

// ADR-HEARTH-144: reconnect delays carry random jitter; drop it so the exact-delay assertions below stay exact.
jest.mock("../../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));

jest.mock("./GoveeClient");
const mockGetStatus = getStatus as jest.MockedFunction<typeof getStatus>;
const mockSetPower = setPower as jest.MockedFunction<typeof setPower>;
const mockSetBrightness = setBrightness as jest.MockedFunction<typeof setBrightness>;
const mockSetColor = setColor as jest.MockedFunction<typeof setColor>;

jest.mock("../../../discovery/familyCommandCenterDeviceLookup", () => ({
  findCurrentIpByMac: jest.fn(),
  findCurrentIpByName: jest.fn(),
  findMacByIp: jest.fn(),
}));
const mockFindCurrentIpByMac = findCurrentIpByMac as jest.MockedFunction<typeof findCurrentIpByMac>;
const mockFindCurrentIpByName = findCurrentIpByName as jest.MockedFunction<typeof findCurrentIpByName>;
const mockFindMacByIp = findMacByIp as jest.MockedFunction<typeof findMacByIp>;

const device: Device = {
  id: "govee-1",
  name: "Desk Lamp",
  category: "lighting",
  manufacturer: "Govee",
  driverId: GOVEE_LIGHT_DRIVER_ID,
  capabilities: [],
  config: { ipAddress: "192.168.1.60" },
};

describe("GoveeLightDriver", () => {
  let driver: GoveeLightDriver;

  beforeEach(() => {
    driver = new GoveeLightDriver();
    mockGetStatus.mockReset();
    mockSetPower.mockReset();
    mockSetBrightness.mockReset();
    mockSetColor.mockReset();
    mockFindCurrentIpByMac.mockReset();
    mockFindCurrentIpByName.mockReset();
    mockFindMacByIp.mockReset();
  });

  // Same real-timer-pollution guard as KasaPlugDriver.test.ts's identical afterEach.
  afterEach(async () => {
    await driver.disconnect(device);
  });

  test("declares power, brightness and color -- no effects/scenes this local API doesn't support", () => {
    expect(driver.getCapabilities()).toEqual(["power", "setBrightness", "setColor"]);
  });

  test("connect() reads real on/off, brightness and color straight from the light", async () => {
    mockGetStatus.mockResolvedValue({ onOff: true, brightness: 80, color: { r: 255, g: 0, b: 0 } });

    await driver.connect(device);

    expect(await driver.getState(device)).toMatchObject({ connection: "connected", values: { power: "on", brightness: 80, hue: 0, saturation: 100 } });
  });

  test("connect() reports power off correctly, not just a truthy check", async () => {
    mockGetStatus.mockResolvedValue({ onOff: false });

    await driver.connect(device);

    expect((await driver.getState(device)).values.power).toBe("off");
  });

  test("connect() leaves power/brightness/color unset (unknown) rather than guessing when genuinely missing from the reply", async () => {
    mockGetStatus.mockResolvedValue({});

    await driver.connect(device);

    expect((await driver.getState(device)).values).toEqual({});
  });

  test("connect() throws and marks disconnected, surfacing the LAN-Control/cloud-only message when the light never answers", async () => {
    mockGetStatus.mockRejectedValue(
      new Error("The Govee device did not answer — check that LAN Control is turned on for this device in the Govee Home app, or it may only support Govee's cloud API")
    );

    await expect(driver.connect(device)).rejects.toThrow(/LAN Control/);
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("power command toggles from the current cached state, sends the real command, and trusts the light's own readback over the request", async () => {
    mockGetStatus.mockResolvedValueOnce({ onOff: false });
    await driver.connect(device);

    mockSetPower.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValueOnce({ onOff: true });
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(mockSetPower).toHaveBeenCalledWith("192.168.1.60", true);
    expect(result.state?.power).toBe("on");
  });

  test("if the light's readback disagrees with what was requested, the readback wins", async () => {
    mockGetStatus.mockResolvedValueOnce({ onOff: false });
    await driver.connect(device);

    mockSetPower.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValueOnce({ onOff: false });
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.state?.power).toBe("off");
  });

  test("setBrightness clamps into Govee's 1-100 range and sends the readback-confirmed value", async () => {
    mockGetStatus.mockResolvedValueOnce({ onOff: true });
    await driver.connect(device);

    mockSetBrightness.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValueOnce({ onOff: true, brightness: 0 });
    await driver.executeCommand(device, { deviceId: device.id, capability: "setBrightness", args: { brightness: -5 } });

    expect(mockSetBrightness).toHaveBeenCalledWith("192.168.1.60", 1);
  });

  test("setColor converts universal hue/saturation into the RGB the light's LAN API takes", async () => {
    mockGetStatus.mockResolvedValueOnce({ onOff: true });
    await driver.connect(device);

    mockSetColor.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValueOnce({ onOff: true, color: { r: 0, g: 255, b: 0 } });
    await driver.executeCommand(device, { deviceId: device.id, capability: "setColor", args: { hue: 120, saturation: 100 } });

    expect(mockSetColor).toHaveBeenCalledWith("192.168.1.60", 0, 255, 0);
  });

  test("executeCommand throws for any capability other than power/setBrightness/setColor", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" })).rejects.toThrow(/does not implement/);
    expect(mockSetPower).not.toHaveBeenCalled();
  });

  test("a failed command marks the device disconnected, surfacing the specific no-reply message", async () => {
    mockGetStatus.mockResolvedValueOnce({ onOff: true });
    await driver.connect(device);

    mockSetPower.mockResolvedValue(undefined);
    mockGetStatus.mockRejectedValueOnce(
      new Error("The Govee device did not answer — check that LAN Control is turned on for this device in the Govee Home app, or it may only support Govee's cloud API")
    );
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/LAN Control/);

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("requireConfig throws a clear error when config.ipAddress is missing", async () => {
    const unconfigured: Device = { ...device, config: {} };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/pair it first/);
  });

  describe("automatic reconnect (ADR-HEARTH-126)", () => {
    test("connect() failing schedules an automatic retry that succeeds once the light is reachable again", async () => {
      mockGetStatus.mockRejectedValueOnce(new Error("connect ECONNREFUSED 192.168.1.60"));
      await expect(driver.connect(device)).rejects.toThrow();
      expect((await driver.getState(device)).connection).toBe("disconnected");

      mockGetStatus.mockResolvedValueOnce({ onOff: true });
      await new Promise((resolve) => setTimeout(resolve, 2100));

      expect((await driver.getState(device)).connection).toBe("connected");
    }, 10000);
  });

  describe("re-discovery after a network change (ADR-HEARTH-126)", () => {
    function freshDeviceWithMac(): Device {
      return { ...device, config: { ipAddress: "192.168.1.60", hwaddr: "AA:BB:CC:DD:EE:FF" } };
    }

    test("re-locates the light by MAC through Family Command Center and connects at its new address", async () => {
      mockGetStatus.mockRejectedValueOnce(new Error("connect ECONNREFUSED 192.168.1.60"));
      mockFindCurrentIpByMac.mockResolvedValueOnce("192.168.1.218");
      mockGetStatus.mockResolvedValueOnce({ onOff: true });

      const deviceWithMac = freshDeviceWithMac();
      await driver.connect(deviceWithMac);

      expect(mockFindCurrentIpByMac).toHaveBeenCalledWith("AA:BB:CC:DD:EE:FF");
      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.218");
      expect((await driver.getState(deviceWithMac)).connection).toBe("connected");
    });

    test("a device with no saved hwaddr falls back to a name-based lookup and backfills its MAC", async () => {
      const deviceWithNoMac: Device = { ...device, config: { ipAddress: "192.168.1.60" } };
      mockGetStatus.mockRejectedValueOnce(new Error("connect ECONNREFUSED 192.168.1.60"));
      mockFindCurrentIpByName.mockResolvedValueOnce("192.168.1.218");
      mockFindMacByIp.mockResolvedValueOnce("11:22:33:44:55:66");
      mockGetStatus.mockResolvedValueOnce({ onOff: true });

      await driver.connect(deviceWithNoMac);

      expect(mockFindCurrentIpByName).toHaveBeenCalledWith("Desk Lamp");
      expect(deviceWithNoMac.config?.ipAddress).toBe("192.168.1.218");
      expect(deviceWithNoMac.config?.hwaddr).toBe("11:22:33:44:55:66");
    });
  });
});
