import { DenonDriver } from "./DenonDriver";
import { Device } from "../../../core/types/Device";

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

  test("power command toggles based on real current state, then re-reads it", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(xmlResponse(statusXml({ power: "ON" }))) // applyCommand's read
      .mockResolvedValueOnce(okResponse()) // powerStandby
      .mockResolvedValueOnce(xmlResponse(statusXml({ power: "OFF" }))); // refreshState

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.success).toBe(true);
    expect(result.state?.power).toBe("off");
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppPower.xml?1+PowerStandby");
  });

  test("power command sends PowerOn when currently off", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(xmlResponse(statusXml({ power: "OFF" }))).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(xmlResponse(statusXml({ power: "ON" })));

    await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppPower.xml?1+PowerOn");
  });

  test("mute toggles based on real current state", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(xmlResponse(statusXml({ muted: false }))).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(xmlResponse(statusXml({ muted: true })));

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });

    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("http://192.168.1.80:80/goform/formiPhoneAppMute.xml?1+MuteOn");
    expect(result.state?.muted).toBe(true);
  });

  test("setVolume without a numeric arg rejects before making any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setVolume" })).rejects.toThrow(/numeric/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("rejects a device with no config instead of silently doing nothing", async () => {
    const unconfigured: Device = { ...device, config: undefined };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/missing Denon\/Marantz config/);
  });

  test("any other capability throws — never claims to implement playPause/inputSelection", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "playPause" })).rejects.toThrow(/does not implement/);
  });
});
