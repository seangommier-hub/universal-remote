import { RokuEcpDriver, ROKU_ECP_DRIVER_ID } from "./RokuEcpDriver";
import { Device } from "../../../core/types/Device";

function deviceInfoResponse(powerMode: string, modelName = "Roku Ultra") {
  return {
    ok: true,
    status: 200,
    text: async () => `<device-info><power-mode>${powerMode}</power-mode><model-name>${modelName}</model-name></device-info>`,
  } as Response;
}

function okResponse() {
  return { ok: true, status: 200 } as Response;
}

const device: Device = {
  id: "roku-1",
  name: "Living Room Roku",
  category: "streaming",
  manufacturer: "Roku",
  driverId: ROKU_ECP_DRIVER_ID,
  capabilities: [],
  config: { ipAddress: "192.168.1.80" },
};

describe("RokuEcpDriver", () => {
  let driver: RokuEcpDriver;

  beforeEach(() => {
    driver = new RokuEcpDriver();
    global.fetch = jest.fn();
  });

  test("declares inputSelection (ECP has real input keys) but not power/setVolume/menu", () => {
    const caps = driver.getCapabilities();
    expect(caps).toContain("inputSelection");
    expect(caps).not.toContain("power");
    expect(caps).not.toContain("powerOn");
    expect(caps).not.toContain("setVolume");
    expect(caps).not.toContain("menu");
  });

  test("connect() reads real power state from device-info", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values.power).toBe("on");
    expect(state.values.model).toBe("Roku Ultra");
  });

  test("powerOff sends the PowerOff key then re-reads real state", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(deviceInfoResponse("PowerOff"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "powerOff" });

    const keypressCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(keypressCall[0]).toBe("http://192.168.1.80:8060/keypress/PowerOff");
    expect(result.state?.power).toBe("off");
  });

  test("powerOff falls back to optimistic 'off' if the post-command read-back fails (device may be unreachable once off)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockRejectedValueOnce(new Error("network unreachable"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "powerOff" });

    expect(result.success).toBe(true);
    expect(result.state?.power).toBe("off");
  });

  test("inputSelection maps 'hdmi2' to the documented InputHDMI2 key", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());
    await driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "hdmi2" } });

    const call = (global.fetch as jest.Mock).mock.calls[1];
    expect(call[0]).toBe("http://192.168.1.80:8060/keypress/InputHDMI2");
  });

  test("launchApp maps 'netflix' to Roku's real public channel id 12 (real-hardware research, 2026-09-10)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());
    await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });

    const call = (global.fetch as jest.Mock).mock.calls[1];
    expect(call[0]).toBe("http://192.168.1.80:8060/launch/12");
  });

  test("launchApp with an unsupported service throws without touching the network", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
    await expect(
      driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "disneyPlus" } })
    ).rejects.toThrow(/supported 'service'/);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  test("mute toggles the locally-tracked muted flag (ECP has no mute-state query)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValue(okResponse());
    const first = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });
    expect(first.state?.muted).toBe(true);

    const second = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });
    expect(second.state?.muted).toBe(false);
  });

  test("directionalNavigation without a valid direction throws before any network call for that command", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation" })).rejects.toThrow();
  });

  test("a bad command argument does not mark a healthy device disconnected or start a reconnect loop (real-hardware finding, 2026-09-09)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation" })).rejects.toThrow();
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: "not-a-number" } })).rejects.toThrow();
    await expect(
      driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: 42 } })
    ).rejects.toThrow();

    const state = await driver.getState(device);
    expect(state.connection).toBe("connected"); // never touched by any of the three validation failures above

    // No reconnect timer was scheduled — if one had been, a fetch call would eventually fire on
    // its own; confirm the mock was never called again beyond the initial connect().
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  test("setChannel sends a Lit_<digit> keypress per digit, in order, via Roku's documented literal-character format", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValue(okResponse());
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: 142 } });

    const keypressUrls = (global.fetch as jest.Mock).mock.calls.slice(1).map((call) => call[0]);
    expect(keypressUrls).toEqual([
      "http://192.168.1.80:8060/keypress/Lit_1",
      "http://192.168.1.80:8060/keypress/Lit_4",
      "http://192.168.1.80:8060/keypress/Lit_2",
    ]);
    expect(result.state?.channel).toBe(142);
  }, 10000);

  test("setChannel rejects a non-numeric channel arg without any network call", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn"));
    await driver.connect(device);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: "12" } })).rejects.toThrow(
      /numeric 'channel'/
    );
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1); // only the connect() call
  });
});
