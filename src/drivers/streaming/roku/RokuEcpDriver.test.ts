import { RokuEcpDriver, ROKU_ECP_DRIVER_ID } from "./RokuEcpDriver";
import { Device } from "../../../core/types/Device";

function deviceInfoResponse(powerMode: string, modelName = "Roku Ultra") {
  return {
    ok: true,
    status: 200,
    text: async () => `<device-info><power-mode>${powerMode}</power-mode><model-name>${modelName}</model-name></device-info>`,
  } as Response;
}

// Real shape per Roku's own ECP docs — see RokuEcpClient.ts's RokuMediaPlayerState comment.
function mediaPlayerResponse(state = "close") {
  return {
    ok: true,
    status: 200,
    text: async () => `<player error="false" state="${state}"><position>0 ms</position></player>`,
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

/** connect() now reads device-info AND queries /query/media-player (real playback state,
 * ADR-HEARTH-051) — two fetch calls, in that order. Centralizing the mock setup here so every
 * test doesn't have to know that call count/order by hand. */
async function connectRoku(driver: RokuEcpDriver, powerMode = "PowerOn", playbackState = "close"): Promise<void> {
  (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse(powerMode)).mockResolvedValueOnce(mediaPlayerResponse(playbackState));
  await driver.connect(device);
}

describe("RokuEcpDriver", () => {
  let driver: RokuEcpDriver;

  beforeEach(() => {
    driver = new RokuEcpDriver();
    global.fetch = jest.fn();
  });

  test("declares inputSelection (ECP has real input keys) and playPause but not power/setVolume/menu", () => {
    const caps = driver.getCapabilities();
    expect(caps).toContain("inputSelection");
    expect(caps).toContain("playPause");
    expect(caps).not.toContain("power");
    expect(caps).not.toContain("powerOn");
    expect(caps).not.toContain("setVolume");
    expect(caps).not.toContain("menu");
  });

  test("connect() reads real power state from device-info and real playback state from media-player", async () => {
    await connectRoku(driver, "PowerOn", "play");
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values.power).toBe("on");
    expect(state.values.model).toBe("Roku Ultra");
    expect(state.values.playbackState).toBe("playing");
  });

  test("connect() normalizes a non-media 'close' state to 'stopped', not left blank or guessed", async () => {
    await connectRoku(driver, "PowerOn", "close");
    const state = await driver.getState(device);
    expect(state.values.playbackState).toBe("stopped");
  });

  test("connect() still succeeds if the media-player query itself fails — playback state just stays unset", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse("PowerOn")).mockRejectedValueOnce(new Error("timeout"));
    await driver.connect(device);
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.playbackState).toBeUndefined();
  });

  test("powerOff sends the PowerOff key then re-reads real state", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(deviceInfoResponse("PowerOff"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "powerOff" });

    const keypressCall = (global.fetch as jest.Mock).mock.calls[2];
    expect(keypressCall[0]).toBe("http://192.168.1.80:8060/keypress/PowerOff");
    expect(result.state?.power).toBe("off");
  });

  test("powerOff falls back to optimistic 'off' if the post-command read-back fails (device may be unreachable once off)", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockRejectedValueOnce(new Error("network unreachable"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "powerOff" });

    expect(result.success).toBe(true);
    expect(result.state?.power).toBe("off");
  });

  test("playPause sends the documented 'Play' toggle key then re-reads real playback state", async () => {
    await connectRoku(driver, "PowerOn", "close"); // starts stopped

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(mediaPlayerResponse("play"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });

    const keypressCall = (global.fetch as jest.Mock).mock.calls[2];
    expect(keypressCall[0]).toBe("http://192.168.1.80:8060/keypress/Play");
    expect(keypressCall[1]).toMatchObject({ method: "POST" });
    expect(result.state?.playbackState).toBe("playing");
  });

  test("playPause reflects a real pause too, not just play (same 'Play' toggle key both directions)", async () => {
    await connectRoku(driver, "PowerOn", "play");

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(mediaPlayerResponse("pause"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });

    expect(result.state?.playbackState).toBe("paused");
  });

  test("playPause falls back to leaving playbackState as last-known if the post-command read-back fails", async () => {
    await connectRoku(driver, "PowerOn", "play");

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockRejectedValueOnce(new Error("timeout"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });

    expect(result.success).toBe(true);
    expect(result.state?.playbackState).toBe("playing"); // unchanged from connect(), not clobbered to undefined
  });

  test("inputSelection maps 'hdmi2' to the documented InputHDMI2 key", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());
    await driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "hdmi2" } });

    const call = (global.fetch as jest.Mock).mock.calls[2];
    expect(call[0]).toBe("http://192.168.1.80:8060/keypress/InputHDMI2");
  });

  test("launchApp maps 'netflix' to Roku's real public channel id 12 (real-hardware research, 2026-09-10)", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());
    await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });

    const call = (global.fetch as jest.Mock).mock.calls[2];
    expect(call[0]).toBe("http://192.168.1.80:8060/launch/12");
  });

  test("launchApp with an unsupported service throws without touching the network", async () => {
    await connectRoku(driver);

    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
    await expect(
      driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "disneyPlus" } })
    ).rejects.toThrow(/supported 'service'/);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  test("mute toggles the locally-tracked muted flag (ECP has no mute-state query)", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValue(okResponse());
    const first = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });
    expect(first.state?.muted).toBe(true);

    const second = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });
    expect(second.state?.muted).toBe(false);
  });

  test("directionalNavigation without a valid direction throws before any network call for that command", async () => {
    await connectRoku(driver);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation" })).rejects.toThrow();
  });

  test("a bad command argument does not mark a healthy device disconnected or start a reconnect loop (real-hardware finding, 2026-09-09)", async () => {
    await connectRoku(driver);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation" })).rejects.toThrow();
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: "not-a-number" } })).rejects.toThrow();
    await expect(
      driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: 42 } })
    ).rejects.toThrow();

    const state = await driver.getState(device);
    expect(state.connection).toBe("connected"); // never touched by any of the three validation failures above

    // No reconnect timer was scheduled — if one had been, a fetch call would eventually fire on
    // its own; confirm the mock was never called again beyond the two connect() reads (device-info
    // + media-player).
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(2);
  });

  test("setChannel sends a Lit_<digit> keypress per digit, in order, via Roku's documented literal-character format", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValue(okResponse());
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: 142 } });

    const keypressUrls = (global.fetch as jest.Mock).mock.calls.slice(2).map((call) => call[0]);
    expect(keypressUrls).toEqual([
      "http://192.168.1.80:8060/keypress/Lit_1",
      "http://192.168.1.80:8060/keypress/Lit_4",
      "http://192.168.1.80:8060/keypress/Lit_2",
    ]);
    expect(result.state?.channel).toBe(142);
  }, 10000);

  test("setChannel rejects a non-numeric channel arg without any network call", async () => {
    await connectRoku(driver);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: "12" } })).rejects.toThrow(
      /numeric 'channel'/
    );
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(2); // only the two connect() reads
  });
});
