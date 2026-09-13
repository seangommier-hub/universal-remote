import { YamahaMusicCastDriver } from "./YamahaMusicCastDriver";
import { Device } from "../../../core/types/Device";

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

  test("power command toggles based on real current state, then re-reads it", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(statusResponse({ power: "on" })) // applyCommand's read
      .mockResolvedValueOnce(okResponse()) // setPower
      .mockResolvedValueOnce(statusResponse({ power: "standby" })); // refreshState

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.success).toBe(true);
    expect(result.state?.power).toBe("off");
    const setPowerUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setPowerUrl).toContain("/main/setPower?power=standby");
  });

  test("volumeUp increases relative to the device's own real current volume and max", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(statusResponse({ volume: 30, max_volume: 100 })) // applyCommand's read
      .mockResolvedValueOnce(okResponse()) // setVolume
      .mockResolvedValueOnce(statusResponse({ volume: 35 })); // refreshState

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const setVolumeUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setVolumeUrl).toContain("/main/setVolume?volume=35");
    expect(result.state?.volume).toBe(35);
  });

  test("volumeUp never requests past the device's own reported max_volume", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(statusResponse({ volume: 98, max_volume: 100 }))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(statusResponse({ volume: 100 }));

    await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const setVolumeUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setVolumeUrl).toContain("/main/setVolume?volume=100");
  });

  test("volumeDown never requests below zero", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(statusResponse({ volume: 2 }))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(statusResponse({ volume: 0 }));

    await driver.executeCommand(device, { deviceId: device.id, capability: "volumeDown" });

    const setVolumeUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setVolumeUrl).toContain("/main/setVolume?volume=0");
  });

  test("mute toggles based on real current state", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(statusResponse({ mute: false }))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(statusResponse({ mute: true }));

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });

    const setMuteUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(setMuteUrl).toContain("/main/setMute?enable=true");
    expect(result.state?.muted).toBe(true);
  });

  test("inputSelection sends the real input id straight through, never a guessed/hardcoded one", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(statusResponse({ input: "net_radio" }));

    await driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "net_radio" } });

    const setInputUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(setInputUrl).toContain("/main/setInput?input=net_radio");
  });

  test("a non-zero response_code raises a real error rather than being treated as success", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(errorResponse(3)); // "ID not exist" per the spec

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/response_code 3/);
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
});
