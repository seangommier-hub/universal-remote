import { DenonDriver } from "./DenonDriver";
import { Device } from "../../../core/types/Device";
import { resetRelayNecessityCacheForTests } from "../../../core/network/httpRelayFallback";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

function statusXml(fields: { power?: string; volumeDb?: number; muted?: boolean } = {}) {
  const { power = "ON", volumeDb = -50, muted = false } = fields;
  return `<?xml version="1.0" encoding="utf-8" ?><item><Power><value>${power}</value></Power><MasterVolume><value>${volumeDb}</value></MasterVolume><Mute><value>${muted ? "on" : "off"}</value></Mute></item>`;
}
function xmlResponse(xml: string) {
  return { ok: true, status: 200, text: async () => xml } as Response;
}
function okResponse() {
  return { ok: true, status: 200, text: async () => "" } as Response;
}

const device: Device = {
  id: "denon-1",
  name: "Living Room Denon",
  category: "tv",
  manufacturer: "Denon",
  driverId: "denon-marantz",
  capabilities: [],
  config: { ipAddress: "192.168.1.80" },
};

describe("DenonDriver", () => {
  let driver: DenonDriver;

  beforeEach(() => {
    driver = new DenonDriver();
    global.fetch = jest.fn();
    mockLoadConfig.mockReset();
    resetRelayNecessityCacheForTests();
  });

  test("declares only capabilities verified against the real protocol — no playPause, no inputSelection", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(["power", "volumeUp", "volumeDown", "setVolume", "mute"]);
    expect(caps).not.toContain("playPause");
    expect(caps).not.toContain("inputSelection");
  });

  test("connect() reads real power/volume/mute state, volume kept as the receiver's own dB value", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(xmlResponse(statusXml({ power: "ON", volumeDb: -55.5, muted: true })));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values).toEqual({ power: "on", volume: -55.5, muted: true });
  });

  // ADR-HEARTH-179: the read above is load-bearing (power has to be flipped, not set to an
  // explicit target) — its result plus the toggle direction we just sent already tells us the new
  // state, so no third, verification getStatus() call follows it the way there used to be.
  test("power command toggles based on real current state and reports the result with no re-read", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(xmlResponse(statusXml({ power: "ON" }))) // applyCommand's read
      .mockResolvedValueOnce(okResponse()); // powerStandby

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.success).toBe(true);
    expect(result.state?.power).toBe("off");
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppPower.xml?1+PowerStandby");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("power command sends PowerOn when currently off", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(xmlResponse(statusXml({ power: "OFF" }))).mockResolvedValueOnce(okResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppPower.xml?1+PowerOn");
    expect(result.state?.power).toBe("on");
  });

  // ADR-HEARTH-179: this read is load-bearing (setMute takes an explicit boolean), not a
  // verification read-back — it already carries the current volume too, so no second call follows.
  test("mute toggles based on real current state and reports optimistically with no second read", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(xmlResponse(statusXml({ muted: false, volumeDb: -40 }))).mockResolvedValueOnce(okResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });

    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppMute.xml?1+MuteOn");
    expect(result.state?.muted).toBe(true);
    expect(result.state?.volume).toBe(-40); // carried through from the load-bearing read, not a second call
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("setVolume without a numeric arg rejects before making any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setVolume" })).rejects.toThrow(/numeric/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ADR-HEARTH-179: an exact value we just set — trust it instead of paying a read-back.
  test("setVolume sends the exact value and reports it optimistically, with no read-back", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "setVolume", args: { volume: -30 } });

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppVolume.xml?1+-30.0");
    expect(result.state?.volume).toBe(-30);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("volumeUp still reads real state back — a relative step whose resulting dB level the receiver's own response doesn't carry", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(xmlResponse(statusXml({ volumeDb: -49.5 })));

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    expect(result.state?.volume).toBe(-49.5);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // ADR-HEARTH-179: removing the trailing refreshState() call for power/mute/setVolume also
  // removed refreshState's own generation guard against exactly this race — restored here via
  // markConnected's own guard, so a disconnect() mid-command still wins.
  test("a disconnect() that races with an in-flight command wins — its own disconnected state is not overwritten by the command's optimistic patch", async () => {
    let resolveRead!: (value: Response) => void;
    const readPromise = new Promise<Response>((resolve) => {
      resolveRead = resolve;
    });
    (global.fetch as jest.Mock).mockReturnValueOnce(readPromise).mockResolvedValueOnce(okResponse());

    const commandPromise = driver.executeCommand(device, { deviceId: device.id, capability: "power" });
    await driver.disconnect(device); // wins the race while the command's own read is still pending
    resolveRead(xmlResponse(statusXml({ power: "ON" })));

    await commandPromise;
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("rejects a device with no config instead of silently doing nothing", async () => {
    const unconfigured: Device = { ...device, config: undefined };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/missing Denon\/Marantz config/);
  });

  test("any other capability throws — never claims to implement playPause/inputSelection", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "playPause" })).rejects.toThrow(/does not implement/);
  });

  // Real gap found live (2026-09-21, ADR-HEARTH-120): mirrors LgWebOsDriver.ts's/RokuEcpDriver.ts's/
  // SonyBraviaDriver.ts's identical self-healing — a receiver that moves to a different network
  // kept retrying the same dead IP forever.
  describe("re-discovery after a network change", () => {
    function freshDeviceWithMac(): Device {
      return { ...device, config: { ipAddress: "192.168.1.80", hwaddr: "AA:BB:CC:DD:EE:FF" } };
    }

    test("re-locates the device by MAC through Family Command Center and connects at its new address", async () => {
      mockLoadConfig.mockResolvedValueOnce(null).mockResolvedValueOnce({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("Network request failed")) // stale IP -- never answers
        .mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [{ hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.218" }] }) }) // FCC lookup
        .mockResolvedValueOnce(xmlResponse(statusXml({ power: "ON" }))); // retry at the new address succeeds

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
      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.80");
    });
  });
});
