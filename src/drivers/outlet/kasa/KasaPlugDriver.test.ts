import { KASA_PLUG_DRIVER_ID, KasaPlugDriver } from "./KasaPlugDriver";
import { Device } from "../../../core/types/Device";
import { getSysInfo, setRelayState } from "./KasaClient";
import { findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../../discovery/familyCommandCenterDeviceLookup";

jest.mock("./KasaClient");
const mockGetSysInfo = getSysInfo as jest.MockedFunction<typeof getSysInfo>;
const mockSetRelayState = setRelayState as jest.MockedFunction<typeof setRelayState>;

jest.mock("../../../discovery/familyCommandCenterDeviceLookup", () => ({
  findCurrentIpByMac: jest.fn(),
  findCurrentIpByName: jest.fn(),
  findMacByIp: jest.fn(),
}));
const mockFindCurrentIpByMac = findCurrentIpByMac as jest.MockedFunction<typeof findCurrentIpByMac>;
const mockFindCurrentIpByName = findCurrentIpByName as jest.MockedFunction<typeof findCurrentIpByName>;
const mockFindMacByIp = findMacByIp as jest.MockedFunction<typeof findMacByIp>;

const device: Device = {
  id: "kasa-1",
  name: "Christmas Lights",
  category: "outlet",
  manufacturer: "TP-Link",
  driverId: KASA_PLUG_DRIVER_ID,
  capabilities: [],
  config: { ipAddress: "192.168.1.50" },
};

describe("KasaPlugDriver", () => {
  let driver: KasaPlugDriver;

  beforeEach(() => {
    driver = new KasaPlugDriver();
    mockGetSysInfo.mockReset();
    mockSetRelayState.mockReset();
    mockFindCurrentIpByMac.mockReset();
    mockFindCurrentIpByName.mockReset();
    mockFindMacByIp.mockReset();
  });

  // ADR-HEARTH-126: any test whose connect()/executeCommand() fails now also schedules a
  // real-timer reconnect. Left uncleared, that dangling setTimeout fires during a LATER test's
  // own wait window and steals its queued mockGetSysInfo response — the same pollution class
  // found live in AppleTvDriver.test.ts and, earlier, the SwitchBot driver tests.
  afterEach(async () => {
    await driver.disconnect(device);
  });

  test("declares only power — no dimming or energy-monitor readback, even on plugs whose hardware supports it", () => {
    expect(driver.getCapabilities()).toEqual(["power"]);
  });

  test("connect() reads the real relay state and model straight from the plug", async () => {
    mockGetSysInfo.mockResolvedValue({ relayState: true, alias: "Christmas Lights", model: "HS103(US)" });

    await driver.connect(device);

    expect(await driver.getState(device)).toMatchObject({ connection: "connected", values: { power: "on", model: "HS103(US)" } });
  });

  // ADR-HEARTH-088: `alias` is the plug's own real, user-set name — already fetched by
  // getSysInfo() for `model` above, surfaced into state so the add/discovery flow can suggest it
  // instead of a generic default, the same pattern established for Roku (ADR-HEARTH-085).
  test("connect() surfaces the plug's real alias into state.values.deviceName", async () => {
    mockGetSysInfo.mockResolvedValue({ relayState: true, alias: "Christmas Lights", model: "HS103(US)" });

    await driver.connect(device);

    expect((await driver.getState(device)).values.deviceName).toBe("Christmas Lights");
  });

  test("connect() leaves deviceName unset when the plug reports no alias", async () => {
    mockGetSysInfo.mockResolvedValue({ relayState: true, model: "HS103(US)" });

    await driver.connect(device);

    expect((await driver.getState(device)).values.deviceName).toBeUndefined();
  });

  test("connect() reports power off correctly, not just a truthy check", async () => {
    mockGetSysInfo.mockResolvedValue({ relayState: false });

    await driver.connect(device);

    expect((await driver.getState(device)).values.power).toBe("off");
  });

  test("connect() leaves power unset (unknown) rather than guessing when relayState is genuinely missing", async () => {
    mockGetSysInfo.mockResolvedValue({ model: "HS103(US)" });

    await driver.connect(device);

    expect((await driver.getState(device)).values.power).toBeUndefined();
  });

  test("connect() throws and marks disconnected when the plug can't be reached (e.g. it's speaking KLAP, not this legacy protocol)", async () => {
    mockGetSysInfo.mockRejectedValue(new Error("Kasa device at 192.168.1.50 didn't respond with the expected legacy protocol — it may use newer TP-Link firmware this integration doesn't support yet."));

    await expect(driver.connect(device)).rejects.toThrow(/newer TP-Link firmware/);
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("power command toggles from the current cached state, sends the real command, and trusts the plug's own readback over the request", async () => {
    mockGetSysInfo.mockResolvedValueOnce({ relayState: false });
    await driver.connect(device);

    mockSetRelayState.mockResolvedValue(undefined);
    // The plug's own post-command readback is the source of truth, not an assumption the
    // requested state was reached — distinct from SmartThingsOutletDriver's optimistic toggle,
    // since this protocol actually offers a real readback to check.
    mockGetSysInfo.mockResolvedValueOnce({ relayState: true });
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(mockSetRelayState).toHaveBeenCalledWith("192.168.1.50", true);
    expect(result.state?.power).toBe("on");
  });

  test("if the plug's readback disagrees with what was requested, the readback wins", async () => {
    mockGetSysInfo.mockResolvedValueOnce({ relayState: false });
    await driver.connect(device);

    mockSetRelayState.mockResolvedValue(undefined);
    // Asked to turn on, but the plug's own post-command state still reports off (e.g. it
    // rejected the command) — the driver must report what's real, not what was requested.
    mockGetSysInfo.mockResolvedValueOnce({ relayState: false });
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.state?.power).toBe("off");
  });

  test("executeCommand throws for any capability other than power", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" })).rejects.toThrow(/does not implement/);
    expect(mockSetRelayState).not.toHaveBeenCalled();
  });

  test("a failed command marks the device disconnected", async () => {
    mockGetSysInfo.mockResolvedValueOnce({ relayState: true });
    await driver.connect(device);

    mockSetRelayState.mockRejectedValue(new Error("Family Command Center returned 502"));
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow();

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("requireConfig throws a clear error when config.ipAddress is missing", async () => {
    const unconfigured: Device = { ...device, config: {} };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/pair it first/);
  });

  // Real gap found live (2026-09-21, ADR-HEARTH-126): unlike every other per-request driver in
  // this project, KasaPlugDriver never had the "once connected it should never lose connection"
  // backoff loop (ADR-HEARTH-017) — a failed connect() or executeCommand() just threw, with
  // nothing ever scheduling a retry.
  describe("automatic reconnect (ADR-HEARTH-126)", () => {
    test("connect() failing schedules an automatic retry that succeeds once the device is reachable again", async () => {
      mockGetSysInfo.mockRejectedValueOnce(new Error("connect ECONNREFUSED 192.168.1.50:9999"));
      await expect(driver.connect(device)).rejects.toThrow();
      expect((await driver.getState(device)).connection).toBe("disconnected");

      mockGetSysInfo.mockResolvedValueOnce({ relayState: true });
      // Same real-timer wait this project's other drivers use for their identical backoff test
      // (RECONNECT_BASE_DELAY_MS = 2000ms).
      await new Promise((resolve) => setTimeout(resolve, 2100));

      expect((await driver.getState(device)).connection).toBe("connected");
    }, 10000);

    test("a command failing marks the device disconnected (not left stale as 'connected') and schedules a reconnect", async () => {
      mockGetSysInfo.mockResolvedValueOnce({ relayState: true }); // connect()
      await driver.connect(device);

      mockSetRelayState.mockRejectedValueOnce(new Error("timeout"));
      await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow("timeout");
      expect((await driver.getState(device)).connection).toBe("disconnected");

      mockSetRelayState.mockResolvedValueOnce(undefined);
      mockGetSysInfo.mockResolvedValueOnce({ relayState: true });
      await new Promise((resolve) => setTimeout(resolve, 2100));
      expect((await driver.getState(device)).connection).toBe("connected");
    }, 10000);
  });

  // Real gap found live (2026-09-21, ADR-HEARTH-126): mirrors LgWebOsDriver.ts's/RokuEcpDriver.ts's/
  // SonyBraviaDriver.ts's/AppleTvDriver.ts's identical self-healing — a plug that moves to a
  // different network kept failing outright forever instead of re-locating itself through Family
  // Command Center.
  describe("re-discovery after a network change (ADR-HEARTH-126)", () => {
    function freshDeviceWithMac(): Device {
      return { ...device, config: { ipAddress: "192.168.1.50", hwaddr: "AA:BB:CC:DD:EE:FF" } };
    }

    test("re-locates the device by MAC through Family Command Center and connects at its new address", async () => {
      mockGetSysInfo.mockRejectedValueOnce(new Error("connect ECONNREFUSED 192.168.1.50:9999")); // stale IP
      mockFindCurrentIpByMac.mockResolvedValueOnce("192.168.1.218");
      mockGetSysInfo.mockResolvedValueOnce({ relayState: true }); // retry at the new address succeeds

      const deviceWithMac = freshDeviceWithMac();
      await driver.connect(deviceWithMac);

      expect(mockFindCurrentIpByMac).toHaveBeenCalledWith("AA:BB:CC:DD:EE:FF");
      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.218"); // persisted onto the device object, same as LG/Samsung/Roku/Sony/Apple TV
      expect((await driver.getState(deviceWithMac)).connection).toBe("connected");
    });

    test("a genuinely dead device (no better address found) still surfaces a real failure, not a silent hang", async () => {
      mockGetSysInfo.mockRejectedValueOnce(new Error("connect ECONNREFUSED 192.168.1.50:9999"));
      mockFindCurrentIpByMac.mockResolvedValueOnce(undefined);

      const deviceWithMac = freshDeviceWithMac();
      await expect(driver.connect(deviceWithMac)).rejects.toThrow(/ECONNREFUSED/);
      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.50"); // untouched -- nothing better was found
    });

    test("a device with no saved hwaddr falls back to a name-based lookup, re-locates itself, and backfills its MAC", async () => {
      const deviceWithNoMac: Device = { ...device, config: { ipAddress: "192.168.1.50" } };
      mockGetSysInfo.mockRejectedValueOnce(new Error("connect ECONNREFUSED 192.168.1.50:9999"));
      mockFindCurrentIpByName.mockResolvedValueOnce("192.168.1.218");
      mockFindMacByIp.mockResolvedValueOnce("11:22:33:44:55:66");
      mockGetSysInfo.mockResolvedValueOnce({ relayState: true });

      await driver.connect(deviceWithNoMac);

      expect(mockFindCurrentIpByName).toHaveBeenCalledWith("Christmas Lights");
      expect(deviceWithNoMac.config?.ipAddress).toBe("192.168.1.218");
      expect(deviceWithNoMac.config?.hwaddr).toBe("11:22:33:44:55:66"); // backfilled for next time
    });
  });
});
