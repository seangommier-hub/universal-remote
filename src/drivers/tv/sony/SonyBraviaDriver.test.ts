import { SonyBraviaDriver } from "./SonyBraviaDriver";
import { Device } from "../../../core/types/Device";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const powerStatusResponse = (status: "active" | "standby") => jsonResponse({ result: [{ status }], id: 1 });
const volumeInfoResponse = (volume: number, mute: boolean) =>
  jsonResponse({ result: [{ target: "speaker", volume, mute, maxVolume: 100, minVolume: 0 }], id: 1 });
const emptyResultResponse = () => jsonResponse({ result: [], id: 1 });

const device: Device = {
  id: "sony-1",
  name: "Living Room Sony",
  category: "tv",
  manufacturer: "Sony",
  driverId: "sony-bravia",
  capabilities: [],
  config: { ipAddress: "192.168.1.50", psk: "secret-psk" },
};

describe("SonyBraviaDriver", () => {
  let driver: SonyBraviaDriver;

  beforeEach(() => {
    driver = new SonyBraviaDriver();
    global.fetch = jest.fn();
  });

  test("declares only capabilities the Sony REST API actually implements", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(["power", "volumeUp", "volumeDown", "setVolume", "mute", "inputSelection"]);
    expect(caps).not.toContain("directionalNavigation");
  });

  test("connect() reads real power + volume state from the TV", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(powerStatusResponse("standby")).mockResolvedValueOnce(volumeInfoResponse(20, false));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values).toEqual({ power: "off", volume: 20, muted: false });
  });

  test("power command reads current status, sends the opposite, then re-reads state", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("standby")) // applyCommand's read
      .mockResolvedValueOnce(emptyResultResponse()) // setPowerStatus
      .mockResolvedValueOnce(powerStatusResponse("active")) // refreshState
      .mockResolvedValueOnce(volumeInfoResponse(20, false));

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.success).toBe(true);
    expect(result.state?.power).toBe("on");
    const setPowerCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(setPowerCall[1].body)).toMatchObject({ method: "setPowerStatus", params: [{ status: true }] });
  });

  test("volumeUp sends a relative +2 and reports the actual resulting volume, not an assumed one", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(emptyResultResponse()) // setAudioVolume
      .mockResolvedValueOnce(powerStatusResponse("active"))
      .mockResolvedValueOnce(volumeInfoResponse(22, false)); // TV's actual resulting volume

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const volumeCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(volumeCall[1].body)).toMatchObject({ method: "setAudioVolume", params: [{ target: "speaker", volume: "+2" }] });
    expect(result.state?.volume).toBe(22);
  });

  test("inputSelection maps 'hdmi2' to the documented extInput URI", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(emptyResultResponse()).mockResolvedValueOnce(powerStatusResponse("active")).mockResolvedValueOnce(volumeInfoResponse(20, false));

    await driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "hdmi2" } });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(call[1].body)).toMatchObject({ method: "setPlayContent", params: [{ uri: "extInput:hdmi?port=2" }] });
  });

  test("rejects a device with no config instead of silently doing nothing", async () => {
    const unconfigured: Device = { ...device, config: undefined };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/missing Sony BRAVIA config/);
  });

  test("setVolume without a numeric arg rejects before making any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setVolume" })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
