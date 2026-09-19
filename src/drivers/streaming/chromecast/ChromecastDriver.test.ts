import { ChromecastDriver } from "./ChromecastDriver";
import { Device } from "../../../core/types/Device";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}
const statusResponse = (volumeLevel: number, muted = false) => jsonResponse({ volumeLevel, muted });

const device: Device = {
  id: "chromecast-1",
  name: "Living Room Chromecast",
  category: "streaming",
  manufacturer: "Google",
  driverId: "chromecast",
  capabilities: [],
  config: { ipAddress: "192.168.1.95" },
};

describe("ChromecastDriver", () => {
  let driver: ChromecastDriver;

  beforeEach(() => {
    driver = new ChromecastDriver();
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
  });

  test("declares only capabilities the receiver-level relay actually implements — no power, no playPause", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(["volumeUp", "volumeDown", "setVolume", "mute"]);
    expect(caps).not.toContain("power");
    expect(caps).not.toContain("playPause");
  });

  test("connect() reads real volume/mute state via the relay", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse(0.4, false));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values).toEqual({ volume: 0.4, muted: false });
  });

  test("volumeUp increases relative to the real current level, capped at 1.0", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse(0.98)).mockResolvedValueOnce(statusResponse(1));

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const setVolumeCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(setVolumeCall[1].body)).toEqual({ ipAddress: "192.168.1.95", level: 1 });
    expect(result.state?.volume).toBe(1);
  });

  test("volumeDown never requests below 0", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse(0.02)).mockResolvedValueOnce(statusResponse(0));

    await driver.executeCommand(device, { deviceId: device.id, capability: "volumeDown" });

    const setVolumeCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(setVolumeCall[1].body)).toEqual({ ipAddress: "192.168.1.95", level: 0 });
  });

  test("mute toggles based on real current state", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse(0.5, false)).mockResolvedValueOnce(statusResponse(0.5, true));

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });

    const setMuteCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(setMuteCall[1].body)).toEqual({ ipAddress: "192.168.1.95", muted: true });
    expect(result.state?.muted).toBe(true);
  });

  test("setVolume without a numeric arg rejects before making any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setVolume" })).rejects.toThrow(/numeric/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("rejects a device with no config instead of silently doing nothing", async () => {
    const unconfigured: Device = { ...device, config: undefined };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/missing Chromecast config/);
  });

  test("any other capability throws — never claims power or playPause", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/does not implement/);
  });
});
