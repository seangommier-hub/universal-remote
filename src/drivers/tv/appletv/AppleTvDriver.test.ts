import { AppleTvDriver, APPLE_TV_DRIVER_ID } from "./AppleTvDriver";
import { Device } from "../../../core/types/Device";
import { findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../../discovery/familyCommandCenterDeviceLookup";

// ADR-HEARTH-144: reconnect delays carry random jitter; drop it so the exact-delay assertions below stay exact.
// (Pinning Math.random instead makes jest's own source-map quicksort recurse without bound.)
jest.mock("../../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));

const mockSendCommand = jest.fn();
jest.mock("./AppleTvClient", () => ({
  AppleTvClient: jest.fn().mockImplementation(() => ({ sendCommand: mockSendCommand })),
}));

jest.mock("../../../discovery/familyCommandCenterDeviceLookup", () => ({
  findCurrentIpByMac: jest.fn(),
  findCurrentIpByBrand: jest.fn(async () => undefined), findCurrentIpByName: jest.fn(),
  findMacByIp: jest.fn(),
}));
const mockFindCurrentIpByMac = findCurrentIpByMac as jest.MockedFunction<typeof findCurrentIpByMac>;
const mockFindCurrentIpByName = findCurrentIpByName as jest.MockedFunction<typeof findCurrentIpByName>;
const mockFindMacByIp = findMacByIp as jest.MockedFunction<typeof findMacByIp>;

const device: Device = {
  id: "appletv-1",
  name: "Living Room Apple TV",
  category: "streaming",
  manufacturer: "Apple",
  driverId: APPLE_TV_DRIVER_ID,
  capabilities: [],
  config: { ipAddress: "192.168.1.90" },
};

describe("AppleTvDriver", () => {
  let driver: AppleTvDriver;

  beforeEach(() => {
    driver = new AppleTvDriver();
    mockSendCommand.mockReset();
    mockFindCurrentIpByMac.mockReset();
    mockFindCurrentIpByName.mockReset();
    mockFindMacByIp.mockReset();
  });

  // Any test whose connect()/executeCommand() fails now also schedules a real-timer reconnect
  // (ADR-HEARTH-126). Left uncleared, that dangling setTimeout fires during a LATER test's own
  // wait window and steals its queued mockSendCommand response — the same class of leak found
  // live in the SwitchBot driver tests earlier this session. device.id is stable across every
  // device variant used below, so this clears whichever timer the just-finished test left.
  afterEach(async () => {
    await driver.disconnect(device);
  });

  test("declares a real toggleable power plus nav/volume/media capabilities, but not mute/setChannel/inputSelection (no atvremote equivalent)", () => {
    const caps = driver.getCapabilities();
    expect(caps).toContain("power");
    expect(caps).toContain("directionalNavigation");
    expect(caps).not.toContain("mute");
    expect(caps).not.toContain("setChannel");
    expect(caps).not.toContain("inputSelection");
  });

  test("connect() reads real power state from the device", async () => {
    mockSendCommand.mockResolvedValueOnce("PowerState.Off");

    await driver.connect(device);

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "power_state");
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.power).toBe("off");
  });

  test("connect() marks the device disconnected and rethrows when the device is unreachable", async () => {
    mockSendCommand.mockRejectedValueOnce(new Error("NoServiceError: no service available"));

    await expect(driver.connect(device)).rejects.toThrow(/NoServiceError/);
    const state = await driver.getState(device);
    expect(state.connection).toBe("disconnected");
  });

  test("power reads current state then sends the real opposite command — turn_off when currently on", async () => {
    mockSendCommand.mockResolvedValueOnce("PowerState.On").mockResolvedValueOnce("");

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(mockSendCommand).toHaveBeenNthCalledWith(1, "192.168.1.90", "power_state");
    expect(mockSendCommand).toHaveBeenNthCalledWith(2, "192.168.1.90", "turn_off");
    expect(result.state?.power).toBe("off");
  });

  test("power sends turn_on when currently off", async () => {
    mockSendCommand.mockResolvedValueOnce("PowerState.Off").mockResolvedValueOnce("");

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(mockSendCommand).toHaveBeenNthCalledWith(2, "192.168.1.90", "turn_on");
    expect(result.state?.power).toBe("on");
  });

  test("directionalNavigation sends the real up/down/left/right command", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation", args: { direction: "left" } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "left");
  });

  test("back sends the real menu command — Apple's own remote treats Menu as Back/Cancel", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "back" });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "menu");
  });

  test("setVolume sends the numeric level as a positional arg", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "setVolume", args: { volume: 42 } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "set_volume", ["42"]);
  });

  test("launchApp resolves a known streaming service to its real bundle id", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "launch_app", ["com.netflix.Netflix"]);
  });

  test("launchApp accepts a direct bundle id for an app with no fixed service mapping", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { appId: "com.example.SomeApp" } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "launch_app", ["com.example.SomeApp"]);
  });

  test("textEntry sends the string via text_append", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "textEntry", args: { text: "hello" } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "text_append", ["hello"]);
  });

  test("an unsupported capability throws rather than silently no-opping", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "mute" })).rejects.toThrow(/does not implement/);
    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  // Real gap found live (2026-09-21, ADR-HEARTH-126): unlike every other per-request driver in
  // this project, AppleTvDriver never had the "once connected it should never lose connection"
  // backoff loop (ADR-HEARTH-017) — a failed connect() or executeCommand() just threw, with
  // nothing ever scheduling a retry.
  describe("automatic reconnect (ADR-HEARTH-126)", () => {
    test("connect() failing schedules an automatic retry that succeeds once the device is reachable again", async () => {
      mockSendCommand.mockRejectedValueOnce(new Error("NoServiceError: no service available"));
      await expect(driver.connect(device)).rejects.toThrow();
      expect((await driver.getState(device)).connection).toBe("disconnected");

      mockSendCommand.mockResolvedValueOnce("PowerState.On");
      // Same real-timer wait this project's other drivers use for their identical backoff test
      // (RECONNECT_BASE_DELAY_MS = 2000ms).
      await new Promise((resolve) => setTimeout(resolve, 2100));

      expect((await driver.getState(device)).connection).toBe("connected");
    }, 10000);

    test("a command failing marks the device disconnected (not left stale as 'connected') and schedules a reconnect", async () => {
      mockSendCommand.mockResolvedValueOnce("PowerState.On"); // connect()
      await driver.connect(device);

      mockSendCommand.mockRejectedValueOnce(new Error("timeout"));
      await expect(driver.executeCommand(device, { deviceId: device.id, capability: "home" })).rejects.toThrow("timeout");
      expect((await driver.getState(device)).connection).toBe("disconnected");

      mockSendCommand.mockResolvedValueOnce("PowerState.On");
      await new Promise((resolve) => setTimeout(resolve, 2100));
      expect((await driver.getState(device)).connection).toBe("connected");
    }, 10000);
  });

  // Real gap found live (2026-09-21, ADR-HEARTH-126): mirrors LgWebOsDriver.ts's/RokuEcpDriver.ts's/
  // SonyBraviaDriver.ts's identical self-healing — an Apple TV that moves to a different network
  // kept failing outright forever instead of re-locating itself through Family Command Center.
  describe("re-discovery after a network change (ADR-HEARTH-126)", () => {
    function freshDeviceWithMac(): Device {
      return { ...device, config: { ipAddress: "192.168.1.90", hwaddr: "AA:BB:CC:DD:EE:FF" } };
    }

    test("re-locates the device by MAC through Family Command Center and connects at its new address", async () => {
      mockSendCommand.mockRejectedValueOnce(new Error("NoServiceError: no service available")); // stale IP
      mockFindCurrentIpByMac.mockResolvedValueOnce("192.168.1.218");
      mockSendCommand.mockResolvedValueOnce("PowerState.On"); // retry at the new address succeeds

      const deviceWithMac = freshDeviceWithMac();
      await driver.connect(deviceWithMac);

      expect(mockFindCurrentIpByMac).toHaveBeenCalledWith("AA:BB:CC:DD:EE:FF");
      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.218"); // persisted onto the device object, same as LG/Samsung/Roku/Sony
      expect((await driver.getState(deviceWithMac)).connection).toBe("connected");
    });

    test("a genuinely dead device (no better address found) still surfaces a real failure, not a silent hang", async () => {
      mockSendCommand.mockRejectedValueOnce(new Error("NoServiceError: no service available"));
      mockFindCurrentIpByMac.mockResolvedValueOnce(undefined);

      const deviceWithMac = freshDeviceWithMac();
      await expect(driver.connect(deviceWithMac)).rejects.toThrow(/NoServiceError/);
      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.90"); // untouched -- nothing better was found
    });

    test("a device with no saved hwaddr falls back to a name-based lookup, re-locates itself, and backfills its MAC", async () => {
      const deviceWithNoMac: Device = { ...device, name: "AppleTV.lan", config: { ipAddress: "192.168.1.90" } };
      mockSendCommand.mockRejectedValueOnce(new Error("NoServiceError: no service available"));
      mockFindCurrentIpByName.mockResolvedValueOnce("192.168.1.218");
      mockFindMacByIp.mockResolvedValueOnce("11:22:33:44:55:66");
      mockSendCommand.mockResolvedValueOnce("PowerState.On");

      await driver.connect(deviceWithNoMac);

      expect(mockFindCurrentIpByName).toHaveBeenCalledWith("AppleTV.lan");
      expect(deviceWithNoMac.config?.ipAddress).toBe("192.168.1.218");
      expect(deviceWithNoMac.config?.hwaddr).toBe("11:22:33:44:55:66"); // backfilled for next time
    });
  });
});
