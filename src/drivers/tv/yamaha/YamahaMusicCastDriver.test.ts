import { YamahaMusicCastDriver } from "./YamahaMusicCastDriver";
import { Device } from "../../../core/types/Device";
import { resetRelayNecessityCacheForTests } from "../../../core/network/httpRelayFallback";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const statusResponse = (overrides: Partial<{ power: "on" | "standby"; volume: number; max_volume: number; mute: boolean; input: string }> = {}) =>
  jsonResponse({ response_code: 0, power: "on", volume: 30, max_volume: 100, mute: false, input: "hdmi1", ...overrides });
const okResponse = () => jsonResponse({ response_code: 0 });
const featuresResponse = (inputs: string[]) => jsonResponse({ response_code: 0, zone: [{ id: "main", input_list: inputs }] });
const errorResponse = (code: number) => jsonResponse({ response_code: code });

const device: Device = {
  id: "yamaha-1",
  name: "Living Room Receiver",
  category: "tv",
  manufacturer: "Yamaha",
  driverId: "yamaha-musiccast",
  capabilities: [],
  config: { ipAddress: "192.168.1.60" },
};

describe("YamahaMusicCastDriver", () => {
  let driver: YamahaMusicCastDriver;

  beforeEach(() => {
    driver = new YamahaMusicCastDriver();
    global.fetch = jest.fn();
    mockLoadConfig.mockReset();
    resetRelayNecessityCacheForTests();
  });

  test("declares only capabilities the Extended Control API actually implements", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(["power", "volumeUp", "volumeDown", "setVolume", "mute", "inputSelection"]);
    expect(caps).not.toContain("directionalNavigation");
  });

  test("connect() reads real status and the real input list off the device", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(statusResponse({ power: "standby", volume: 15, mute: true }))
      .mockResolvedValueOnce(featuresResponse(["hdmi1", "hdmi2", "net_radio"]));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values).toMatchObject({ power: "off", volume: 15, muted: true });
    expect(state.values.inputs).toEqual([
      { id: "hdmi1", label: "Hdmi1" },
      { id: "hdmi2", label: "Hdmi2" },
      { id: "net_radio", label: "Net Radio" },
    ]);
  });

  test("a device with no available inputs leaves the UI without an input list rather than failing connect()", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse()).mockResolvedValueOnce(featuresResponse([]));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values.inputs).toBeUndefined();
  });

  // ADR-HEARTH-179: the read above is load-bearing (power has to be flipped) — it already tells us
  // the resulting state once combined with the toggle direction we just sent, so no third,
  // verification getStatus() call follows it the way there used to be.
  test("power command toggles based on real current state and reports the result with no re-read", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(statusResponse({ power: "on" })) // applyCommand's read
      .mockResolvedValueOnce(okResponse()); // setPower

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.success).toBe(true);
    expect(result.state?.power).toBe("off");
    const setPowerUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setPowerUrl).toContain("/main/setPower?power=standby");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // ADR-HEARTH-179: unlike Sony's raw relative delta, this driver already reads current
  // volume+max to compute an absolute target client-side and sends THAT — an exact set, so the
  // value just sent can be trusted with no separate read-back.
  test("volumeUp increases relative to the device's own real current volume and max, with no read-back", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(statusResponse({ volume: 30, max_volume: 100 })) // applyCommand's read
      .mockResolvedValueOnce(okResponse()); // setVolume

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const setVolumeUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setVolumeUrl).toContain("/main/setVolume?volume=35");
    expect(result.state?.volume).toBe(35);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("volumeUp never requests past the device's own reported max_volume", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse({ volume: 98, max_volume: 100 })).mockResolvedValueOnce(okResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const setVolumeUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setVolumeUrl).toContain("/main/setVolume?volume=100");
    expect(result.state?.volume).toBe(100);
  });

  test("volumeDown never requests below zero", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse({ volume: 2 })).mockResolvedValueOnce(okResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "volumeDown" });

    const setVolumeUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setVolumeUrl).toContain("/main/setVolume?volume=0");
    expect(result.state?.volume).toBe(0);
  });

  // ADR-HEARTH-179: this read is load-bearing (setMute takes an explicit boolean) — no second
  // read follows it.
  test("mute toggles based on real current state and reports optimistically with no second read", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse({ mute: false })).mockResolvedValueOnce(okResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });

    const setMuteUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setMuteUrl).toContain("/main/setMute?enable=true");
    expect(result.state?.muted).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("setVolume sends the exact value and reports it optimistically, with no read-back (ADR-HEARTH-179)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "setVolume", args: { volume: 60 } });

    const setVolumeUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(setVolumeUrl).toContain("/main/setVolume?volume=60");
    expect(result.state?.volume).toBe(60);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("inputSelection sends the real input id straight through, never a guessed/hardcoded one, with no follow-up read (ADR-HEARTH-179)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "net_radio" } });

    const setInputUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(setInputUrl).toContain("/main/setInput?input=net_radio");
    expect(result.state?.input).toBe("net_radio");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("a non-zero response_code raises a real error rather than being treated as success", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(errorResponse(3)); // "ID not exist" per the spec

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/response_code 3/);
  });

  // ADR-HEARTH-179: removing the trailing refreshState() call for every command also removed
  // refreshState's own generation guard against exactly this race — restored here via
  // markConnected's own guard, so a disconnect() mid-command still wins.
  test("a disconnect() that races with an in-flight command wins — its own disconnected state is not overwritten by the command's optimistic patch", async () => {
    let resolveRead!: (value: Response) => void;
    const readPromise = new Promise<Response>((resolve) => {
      resolveRead = resolve;
    });
    (global.fetch as jest.Mock).mockReturnValueOnce(readPromise).mockResolvedValueOnce(okResponse());

    const commandPromise = driver.executeCommand(device, { deviceId: device.id, capability: "power" });
    await driver.disconnect(device); // wins the race while the command's own read is still pending
    resolveRead(statusResponse({ power: "on" }));

    await commandPromise;
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("rejects a device with no config instead of silently doing nothing", async () => {
    const unconfigured: Device = { ...device, config: undefined };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/missing Yamaha MusicCast config/);
  });

  test("setVolume without a numeric arg rejects before making any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setVolume" })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("inputSelection without a string arg rejects before making any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection" })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // Real gap found live (2026-09-21, ADR-HEARTH-120): mirrors LgWebOsDriver.ts's/RokuEcpDriver.ts's/
  // SonyBraviaDriver.ts's/DenonDriver.ts's identical self-healing — a receiver that moves to a
  // different network kept retrying the same dead IP forever.
  describe("re-discovery after a network change", () => {
    function freshDeviceWithMac(): Device {
      return { ...device, config: { ipAddress: "192.168.1.60", hwaddr: "AA:BB:CC:DD:EE:FF" } };
    }

    test("re-locates the device by MAC through Family Command Center and connects at its new address", async () => {
      mockLoadConfig.mockResolvedValueOnce(null).mockResolvedValueOnce({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("Network request failed"))
        .mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [{ hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.218" }] }) })
        .mockResolvedValueOnce(statusResponse({ power: "on" }));

      const deviceWithMac = freshDeviceWithMac();
      await driver.connect(deviceWithMac);

      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.218");
      expect((await driver.getState(deviceWithMac)).connection).toBe("connected");
    });

    test("a genuinely dead device (no better address found) still surfaces a real failure, not a silent hang", async () => {
      mockLoadConfig.mockResolvedValue(null);
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));

      const deviceWithMac = freshDeviceWithMac();
      await expect(driver.connect(deviceWithMac)).rejects.toThrow(/isn't configured for relay fallback/);
      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.60");
    });
  });
});
