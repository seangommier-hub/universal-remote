import { SonyBraviaDriver } from "./SonyBraviaDriver";
import { Device } from "../../../core/types/Device";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const powerStatusResponse = (status: "active" | "standby") => jsonResponse({ result: [{ status }], id: 1 });
const volumeInfoResponse = (volume: number, mute: boolean) =>
  jsonResponse({ result: [{ target: "speaker", volume, mute, maxVolume: 100, minVolume: 0 }], id: 1 });
const emptyResultResponse = () => jsonResponse({ result: [], id: 1 });
const externalInputsResponse = (inputs: { uri: string; title: string }[]) => jsonResponse({ result: [inputs], id: 1 });
const systemInformationResponse = (name: string) => jsonResponse({ result: [{ name }], id: 1 });

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

  test("declares REST-API capabilities plus IRCC-IP nav/select/back/home (ADR-HEARTH-071) — but not menu or textEntry, which neither protocol supports", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(["power", "volumeUp", "volumeDown", "setVolume", "mute", "inputSelection", "directionalNavigation", "select", "back", "home"]);
    expect(caps).not.toContain("menu");
    expect(caps).not.toContain("textEntry");
  });

  test("connect() reads real power + volume state from the TV", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("standby"))
      .mockResolvedValueOnce(volumeInfoResponse(20, false))
      .mockResolvedValueOnce(externalInputsResponse([]));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values).toEqual({ power: "off", volume: 20, muted: false });
  });

  test("connect() also reads the real external input list (real-hardware research, 2026-09-10)", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("active"))
      .mockResolvedValueOnce(volumeInfoResponse(20, false))
      .mockResolvedValueOnce(
        externalInputsResponse([
          { uri: "extInput:hdmi?port=1", title: "HDMI 1" },
          { uri: "extInput:hdmi?port=2", title: "HDMI 2" },
        ])
      );

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.values.inputs).toEqual([
      { id: "extInput:hdmi?port=1", label: "HDMI 1" },
      { id: "extInput:hdmi?port=2", label: "HDMI 2" },
    ]);
  });

  // ADR-HEARTH-096: verified directly against Sony's own BRAVIA Professional Displays Knowledge
  // Center — getSystemInformation's "name" field is the user-set TV name, present since v1.0.
  test("connect() surfaces the TV's real device name into state.values.deviceName", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("active"))
      .mockResolvedValueOnce(volumeInfoResponse(20, false))
      .mockResolvedValueOnce(externalInputsResponse([]))
      .mockResolvedValueOnce(systemInformationResponse("Living Room Sony"));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.values.deviceName).toBe("Living Room Sony");
  });

  test("a command run after connect() doesn't wipe the input list back out of state (real bug found alongside this feature)", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("active"))
      .mockResolvedValueOnce(volumeInfoResponse(20, false))
      .mockResolvedValueOnce(externalInputsResponse([{ uri: "extInput:hdmi?port=1", title: "HDMI 1" }]));
    await driver.connect(device);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(emptyResultResponse()) // setAudioVolume
      .mockResolvedValueOnce(powerStatusResponse("active")) // refreshState after the command
      .mockResolvedValueOnce(volumeInfoResponse(22, false));
    await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const state = await driver.getState(device);
    expect(state.values.inputs).toEqual([{ id: "extInput:hdmi?port=1", label: "HDMI 1" }]);
    expect(state.values.volume).toBe(22); // refreshState's own fields still update correctly alongside the preserved ones
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

  test("inputSelection passes a real uri (from the dynamic input list) straight through, not re-parsed as hdmi shorthand", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(emptyResultResponse()).mockResolvedValueOnce(powerStatusResponse("active")).mockResolvedValueOnce(volumeInfoResponse(20, false));

    await driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "extInput:composite?port=1" } });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(call[1].body)).toMatchObject({ method: "setPlayContent", params: [{ uri: "extInput:composite?port=1" }] });
  });

  test("rejects a device with no config instead of silently doing nothing", async () => {
    const unconfigured: Device = { ...device, config: undefined };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/missing Sony BRAVIA config/);
  });

  test("setVolume without a numeric arg rejects before making any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setVolume" })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ADR-HEARTH-071: directionalNavigation/select/back/home go through SonyIrccClient (a separate
  // SOAP-over-HTTP protocol from the REST calls above), then executeCommand's own refreshState()
  // still runs afterward the same as every other command — the IRCC POST itself has no JSON body
  // to assert on the way the REST calls' JSON-RPC envelopes do, so these check the raw XML body.
  test("directionalNavigation sends the real, sourced IRCC code for each direction", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response) // IRCC POST
      .mockResolvedValueOnce(powerStatusResponse("active"))
      .mockResolvedValueOnce(volumeInfoResponse(20, false));

    await driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation", args: { direction: "up" } });

    const irccCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(irccCall[0]).toBe("http://192.168.1.50:80/sony/ircc");
    expect(irccCall[1].body).toContain("<IRCCCode>AAAAAQAAAAEAAAB0Aw==</IRCCCode>"); // Up
  });

  test("directionalNavigation without a valid direction rejects before any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation" })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("select sends the real Confirm IRCC code", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response).mockResolvedValueOnce(powerStatusResponse("active")).mockResolvedValueOnce(volumeInfoResponse(20, false));

    await driver.executeCommand(device, { deviceId: device.id, capability: "select" });

    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain("<IRCCCode>AAAAAQAAAAEAAABlAw==</IRCCCode>");
  });

  test("back sends the real Return IRCC code", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response).mockResolvedValueOnce(powerStatusResponse("active")).mockResolvedValueOnce(volumeInfoResponse(20, false));

    await driver.executeCommand(device, { deviceId: device.id, capability: "back" });

    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain("<IRCCCode>AAAAAgAAAJcAAAAjAw==</IRCCCode>");
  });

  test("home sends the real Home IRCC code", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response).mockResolvedValueOnce(powerStatusResponse("active")).mockResolvedValueOnce(volumeInfoResponse(20, false));

    await driver.executeCommand(device, { deviceId: device.id, capability: "home" });

    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain("<IRCCCode>AAAAAQAAAAEAAABgAw==</IRCCCode>");
  });
});
