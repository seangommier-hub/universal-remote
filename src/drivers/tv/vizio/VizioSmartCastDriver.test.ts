import { Device } from "../../../core/types/Device";
import { findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../../discovery/familyCommandCenterDeviceLookup";
import { VIZIO_KEYS, isPoweredOn, pressKey, readCurrentInput, readMuted, readVolume, switchInput } from "./VizioClient";
import { VIZIO_SMARTCAST_DRIVER_ID, VizioSmartCastDriver } from "./VizioSmartCastDriver";

// Reconnect delays carry random jitter (ADR-HEARTH-144); drop it so timing assertions stay exact.
jest.mock("../../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));
jest.mock("./VizioClient", () => ({ ...jest.requireActual("./VizioClient"), isPoweredOn: jest.fn(), pressKey: jest.fn(), readVolume: jest.fn(), readMuted: jest.fn(), readCurrentInput: jest.fn(), switchInput: jest.fn() }));
jest.mock("../../../discovery/familyCommandCenterDeviceLookup", () => ({ findCurrentIpByMac: jest.fn(), findCurrentIpByName: jest.fn(), findMacByIp: jest.fn() }));

const mockPower = isPoweredOn as jest.Mock;
const mockPress = pressKey as jest.Mock;
const mockVolume = readVolume as jest.Mock;
const mockMuted = readMuted as jest.Mock;
const mockInput = readCurrentInput as jest.Mock;
const mockSwitchInput = switchInput as jest.Mock;
const mockByMac = findCurrentIpByMac as jest.Mock;
const mockByName = findCurrentIpByName as jest.Mock;
const mockMacByIp = findMacByIp as jest.Mock;

function makeDevice(config: Record<string, unknown> = {}): Device {
  return { id: "vizio-1", name: "Den TV", category: "tv", manufacturer: "Vizio", driverId: VIZIO_SMARTCAST_DRIVER_ID, capabilities: [], config: { ipAddress: "192.168.1.88", port: 7345, authToken: "tok", ...config } };
}

describe("VizioSmartCastDriver", () => {
  let driver: VizioSmartCastDriver;
  let device: Device;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = new VizioSmartCastDriver();
    device = makeDevice();
    mockPower.mockResolvedValue(true);
    mockVolume.mockResolvedValue(15);
    mockMuted.mockResolvedValue(false);
    mockInput.mockResolvedValue("HDMI-1");
    mockPress.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await driver.disconnect(device);
  });

  test("declares only what VizioClient can send: no absolute volume, no app launch", () => {
    const capabilities = driver.getCapabilities();
    expect(capabilities).toEqual(expect.arrayContaining(["power", "volumeUp", "volumeDown", "mute", "inputSelection", "directionalNavigation", "select", "back", "home", "menu"]));
    expect(capabilities).not.toContain("setVolume");
    expect(capabilities).not.toContain("launchApp");
  });

  test("connect() reads power, volume, mute and input while the TV is on", async () => {
    await driver.connect(device);

    expect(await driver.getState(device)).toMatchObject({ connection: "connected", values: { power: "on", volume: 15, muted: false, input: "HDMI-1" } });
  });

  test("connect() to a TV in standby reports off and does not query settings that only exist while on", async () => {
    mockPower.mockResolvedValue(false);

    await driver.connect(device);

    expect((await driver.getState(device)).values).toEqual({ power: "off" });
    expect(mockVolume).not.toHaveBeenCalled();
  });

  test("a settings read that fails leaves that value out but the TV stays connected", async () => {
    mockVolume.mockRejectedValue(new Error("boom"));

    await driver.connect(device);

    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.volume).toBeUndefined();
    expect(state.values.input).toBe("HDMI-1");
  });

  test("connect() to a device with no saved token fails with a pair-first message", async () => {
    device = makeDevice({ authToken: undefined });

    await expect(driver.connect(device)).rejects.toThrow(/not paired yet/);
  });

  test("power turns an on TV off and a standby TV on using the dedicated keys", async () => {
    await driver.connect(device);

    await driver.executeCommand(device, { deviceId: "vizio-1", capability: "power" });
    expect(mockPress).toHaveBeenLastCalledWith(expect.anything(), VIZIO_KEYS.powerOff);
    expect((await driver.getState(device)).values.power).toBe("off");

    await driver.executeCommand(device, { deviceId: "vizio-1", capability: "power" });
    expect(mockPress).toHaveBeenLastCalledWith(expect.anything(), VIZIO_KEYS.powerOn);
    expect((await driver.getState(device)).values.power).toBe("on");
  });

  test("mute presses the toggle key and reports the state the TV confirms", async () => {
    await driver.connect(device);
    mockMuted.mockResolvedValue(true);

    const result = await driver.executeCommand(device, { deviceId: "vizio-1", capability: "mute" });

    expect(mockPress).toHaveBeenLastCalledWith(expect.anything(), VIZIO_KEYS.muteToggle);
    expect(result.state?.muted).toBe(true);
  });

  test("directionalNavigation maps a direction to its key", async () => {
    await driver.connect(device);

    await driver.executeCommand(device, { deviceId: "vizio-1", capability: "directionalNavigation", args: { direction: "left" } });

    expect(mockPress).toHaveBeenLastCalledWith(expect.anything(), VIZIO_KEYS.left);
  });

  test("an invalid direction is rejected without marking the TV disconnected or scheduling a retry", async () => {
    await driver.connect(device);

    await expect(driver.executeCommand(device, { deviceId: "vizio-1", capability: "directionalNavigation", args: { direction: "sideways" } })).rejects.toThrow(/valid 'direction'/);

    expect((await driver.getState(device)).connection).toBe("connected");
    expect(mockPress).not.toHaveBeenCalled();
  });

  test("inputSelection switches to the named input and records it", async () => {
    await driver.connect(device);

    await driver.executeCommand(device, { deviceId: "vizio-1", capability: "inputSelection", args: { input: "HDMI-3" } });

    expect(mockSwitchInput).toHaveBeenCalledWith(expect.objectContaining({ authToken: "tok" }), "HDMI-3");
    expect((await driver.getState(device)).values.input).toBe("HDMI-3");
  });

  test("a capability the driver does not have is rejected", async () => {
    await expect(driver.executeCommand(device, { deviceId: "vizio-1", capability: "setVolume", args: { volume: 5 } })).rejects.toThrow(/does not implement/);
  });

  test("a failed command marks the TV disconnected and rethrows", async () => {
    await driver.connect(device);
    mockPress.mockRejectedValue(new Error("relay down"));

    await expect(driver.executeCommand(device, { deviceId: "vizio-1", capability: "volumeUp" })).rejects.toThrow("relay down");

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  describe("self-heal", () => {
    test("a moved TV is found again by MAC and the saved address is updated", async () => {
      device = makeDevice({ hwaddr: "aa:bb:cc:dd:ee:ff" });
      mockPower.mockRejectedValueOnce(new Error("no route")).mockResolvedValue(true);
      mockByMac.mockResolvedValue("192.168.1.99");

      await driver.connect(device);

      expect(device.config?.ipAddress).toBe("192.168.1.99");
      expect(mockByName).not.toHaveBeenCalled();
      expect((await driver.getState(device)).connection).toBe("connected");
    });

    test("with no saved MAC it looks the TV up by name and learns the MAC", async () => {
      mockPower.mockRejectedValueOnce(new Error("no route")).mockResolvedValue(true);
      mockByName.mockResolvedValue("192.168.1.99");
      mockMacByIp.mockResolvedValue("aa:bb:cc:dd:ee:ff");

      await driver.connect(device);

      expect(device.config?.hwaddr).toBe("aa:bb:cc:dd:ee:ff");
    });

    test("when the lookup finds nothing new the original failure surfaces and a retry is scheduled", async () => {
      jest.useFakeTimers();
      mockPower.mockRejectedValue(new Error("no route"));
      mockByName.mockResolvedValue(null);

      await expect(driver.connect(device)).rejects.toThrow("no route");
      mockPower.mockResolvedValue(true);
      await jest.advanceTimersByTimeAsync(2000);

      expect((await driver.getState(device)).connection).toBe("connected");
      jest.useRealTimers();
    });
  });
});
