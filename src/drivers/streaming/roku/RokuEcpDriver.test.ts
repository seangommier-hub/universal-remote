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

// Real shape per python-rokuecp's own Application model — see RokuEcpClient.ts's RokuApp comment.
function appsResponse(apps: { id: string; name: string }[] = [{ id: "12", name: "Netflix" }]) {
  const xml = apps.map((app) => `<app id="${app.id}" type="appl" version="1.0">${app.name}</app>`).join("");
  return { ok: true, status: 200, text: async () => `<apps>${xml}</apps>` } as Response;
}

// Real shape per Roku's own ECP docs (developer.roku.com/dev/docs/external-control-api) — see
// RokuEcpClient.ts's RokuActiveApp comment. `hasId: false` reproduces the home-screen shape
// (`<app>Roku</app>`, no id attribute); `screensaver: true` adds the sibling element Roku
// includes when its screensaver is active.
function activeAppResponse(appName: string, opts: { hasId?: boolean; screensaver?: boolean } = {}) {
  const idAttr = opts.hasId === false ? "" : ' id="12" type="appl" version="4.3.109"';
  const screensaverTag = opts.screensaver ? '<screensaver id="55c6" type="ssvr" version="1.0.0">Screen Saver</screensaver>' : "";
  return {
    ok: true,
    status: 200,
    text: async () => `<active-app><app${idAttr}>${appName}</app>${screensaverTag}</active-app>`,
  } as Response;
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

/** connect() reads device-info, queries /query/media-player (real playback state,
 * ADR-HEARTH-051), then /query/apps (the installed-channel catalog, ADR-HEARTH-076) — three fetch
 * calls, in that order, as long as media-player resolves cleanly to "play"/"pause" (the default
 * here). Passing an ambiguous state (e.g. "close") triggers an EXTRA corroborating
 * /query/active-app call in between (ADR-HEARTH-068) — tested explicitly below, not through this
 * helper, so tests that don't care about that logic keep a stable, predictable 3-call connect(). */
async function connectRoku(driver: RokuEcpDriver, powerMode = "PowerOn", playbackState = "play"): Promise<void> {
  (global.fetch as jest.Mock).mockResolvedValueOnce(deviceInfoResponse(powerMode)).mockResolvedValueOnce(mediaPlayerResponse(playbackState)).mockResolvedValueOnce(appsResponse());
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

  // ADR-HEARTH-085: the Roku's own real name is already fetched as part of the same device-info
  // read used for power/model above — surfaced into state so the add/discovery flow can offer it
  // as a suggested name instead of the network's generic DHCP hostname.
  test("connect() surfaces the Roku's own real name into state.values.deviceName", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => `<device-info><power-mode>PowerOn</power-mode><model-name>Roku Ultra</model-name><user-device-name>Living Room Roku</user-device-name></device-info>`,
      } as Response)
      .mockResolvedValueOnce(mediaPlayerResponse("play"))
      .mockResolvedValueOnce(appsResponse());
    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.values.deviceName).toBe("Living Room Roku");
  });

  // Real-hardware research (2026-09-15, ADR-HEARTH-068): a non-media ("close") read used to
  // collapse straight to "stopped" — but that's a false claim whenever an app is still actually
  // active (Netflix's PIN-protected profile lock being the concrete real-world trigger). It's now
  // corroborated with a second query (/query/active-app) before committing to "stopped".
  test("an ambiguous 'close' read while the Roku is confirmed idle (home screen) resolves to 'stopped'", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(deviceInfoResponse("PowerOn"))
      .mockResolvedValueOnce(mediaPlayerResponse("close"))
      .mockResolvedValueOnce(activeAppResponse("Roku", { hasId: false }))
      .mockResolvedValueOnce(appsResponse());
    await driver.connect(device);
    const state = await driver.getState(device);
    expect(state.values.playbackState).toBe("stopped");
  });

  test("an ambiguous 'close' read while the screensaver is active also resolves to 'stopped'", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(deviceInfoResponse("PowerOn"))
      .mockResolvedValueOnce(mediaPlayerResponse("close"))
      .mockResolvedValueOnce(activeAppResponse("Roku", { hasId: false, screensaver: true }))
      .mockResolvedValueOnce(appsResponse());
    await driver.connect(device);
    const state = await driver.getState(device);
    expect(state.values.playbackState).toBe("stopped");
  });

  test("an ambiguous 'close' read on first connect, with a real app confirmed active, leaves playbackState unset rather than guessing 'stopped'", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(deviceInfoResponse("PowerOn"))
      .mockResolvedValueOnce(mediaPlayerResponse("close"))
      .mockResolvedValueOnce(activeAppResponse("Netflix"))
      .mockResolvedValueOnce(appsResponse());
    await driver.connect(device);
    const state = await driver.getState(device);
    expect(state.values.playbackState).toBeUndefined();
  });

  // ADR-HEARTH-093: the real app name was already being fetched here for isHomeScreen/
  // isScreensaver corroboration and then discarded — now surfaced for the home screen's
  // now-playing widget to use as a real title instead of a generic label.
  test("an ambiguous read with a real app confirmed active surfaces its name as activeAppName", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(deviceInfoResponse("PowerOn"))
      .mockResolvedValueOnce(mediaPlayerResponse("close"))
      .mockResolvedValueOnce(activeAppResponse("Netflix"))
      .mockResolvedValueOnce(appsResponse());
    await driver.connect(device);
    const state = await driver.getState(device);
    expect(state.values.activeAppName).toBe("Netflix");
  });

  test("does not set activeAppName when confirmed idle (home screen) instead of a real app", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(deviceInfoResponse("PowerOn"))
      .mockResolvedValueOnce(mediaPlayerResponse("close"))
      .mockResolvedValueOnce(activeAppResponse("Roku", { hasId: false }))
      .mockResolvedValueOnce(appsResponse());
    await driver.connect(device);
    const state = await driver.getState(device);
    expect(state.values.activeAppName).toBeUndefined();
  });

  // The actual motivating scenario (Sean, 2026-09-15): Netflix's PIN-protected profile lock makes
  // /query/media-player ambiguous while Netflix itself is still the active app. Before this fix,
  // that flipped a real in-progress "playing" session to a false "stopped" on every poll.
  test("holds a previously-known 'playing' state through a later ambiguous read while the same app is still active (Netflix PIN-lock scenario)", async () => {
    await connectRoku(driver, "PowerOn", "play");

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(mediaPlayerResponse("close"))
      .mockResolvedValueOnce(activeAppResponse("Netflix"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });

    expect(result.state?.playbackState).toBe("playing");
  });

  test("holds the previously-known state if the active-app corroboration query itself fails, rather than assuming stopped", async () => {
    await connectRoku(driver, "PowerOn", "play");

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(mediaPlayerResponse("close")).mockRejectedValueOnce(new Error("timeout"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });

    expect(result.state?.playbackState).toBe("playing");
  });

  test("connect() still succeeds if the media-player query itself fails — playback state just stays unset", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(deviceInfoResponse("PowerOn"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(appsResponse());
    await driver.connect(device);
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.playbackState).toBeUndefined();
  });

  test("connect() still succeeds if the apps query itself fails — the app list just stays unset (ADR-HEARTH-076)", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(deviceInfoResponse("PowerOn"))
      .mockResolvedValueOnce(mediaPlayerResponse("play"))
      .mockRejectedValueOnce(new Error("timeout"));
    await driver.connect(device);
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.apps).toBeUndefined();
  });

  test("connect() populates state.values.apps from a real /query/apps response", async () => {
    await connectRoku(driver);
    const state = await driver.getState(device);
    expect(state.values.apps).toEqual([{ id: "12", name: "Netflix" }]);
  });

  test("powerOff sends the PowerOff key then re-reads real state", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(deviceInfoResponse("PowerOff"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "powerOff" });

    const keypressCall = (global.fetch as jest.Mock).mock.calls[3];
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
    await connectRoku(driver); // starts playing (irrelevant to this test — just avoids the active-app corroboration path)

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse()).mockResolvedValueOnce(mediaPlayerResponse("play"));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });

    const keypressCall = (global.fetch as jest.Mock).mock.calls[3];
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

    const call = (global.fetch as jest.Mock).mock.calls[3];
    expect(call[0]).toBe("http://192.168.1.80:8060/keypress/InputHDMI2");
  });

  test("launchApp maps 'netflix' to Roku's real public channel id 12 (real-hardware research, 2026-09-10)", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());
    await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });

    const call = (global.fetch as jest.Mock).mock.calls[3];
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

  // ADR-HEARTH-076: launchApp can now target any installed channel directly by id (e.g. one
  // discovered via state.values.apps — the "recently launched apps" feature), not just the four
  // fixed streaming services.
  test("launchApp launches any app by id, not just the four fixed streaming services", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());
    await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { appId: "837" } });

    const call = (global.fetch as jest.Mock).mock.calls[3];
    expect(call[0]).toBe("http://192.168.1.80:8060/launch/837");
  });

  // ADR-HEARTH-076: lastLaunchedAppId lets the UI's recent-apps history record a launch
  // regardless of which arg triggered it, without the UI needing to know Roku's own
  // service-name-to-channel-id mapping.
  test("launchApp reports lastLaunchedAppId as the real resolved channel id when launched via 'service'", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });

    expect(result.state?.lastLaunchedAppId).toBe("12");
  });

  test("launchApp reports lastLaunchedAppId as the given id when launched via 'appId'", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValueOnce(okResponse());
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { appId: "837" } });

    expect(result.state?.lastLaunchedAppId).toBe("837");
  });

  test("launchApp requires either a service or an appId, not neither", async () => {
    await connectRoku(driver);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "launchApp" })).rejects.toThrow(/supported 'service' or 'appId'/);
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
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(3);
  });

  test("setChannel sends a Lit_<digit> keypress per digit, in order, via Roku's documented literal-character format", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValue(okResponse());
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: 142 } });

    const keypressUrls = (global.fetch as jest.Mock).mock.calls.slice(3).map((call) => call[0]);
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
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(3); // only the three connect() reads
  });

  test("textEntry sends a Lit_<char> keypress per character, in order (ADR-HEARTH-072)", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValue(okResponse());
    await driver.executeCommand(device, { deviceId: device.id, capability: "textEntry", args: { text: "Hi5" } });

    const keypressUrls = (global.fetch as jest.Mock).mock.calls.slice(3).map((call) => call[0]);
    expect(keypressUrls).toEqual([
      "http://192.168.1.80:8060/keypress/Lit_H",
      "http://192.168.1.80:8060/keypress/Lit_i",
      "http://192.168.1.80:8060/keypress/Lit_5",
    ]);
  }, 10000);

  test("textEntry URL-encodes characters that aren't safe in a URL path segment", async () => {
    await connectRoku(driver);

    (global.fetch as jest.Mock).mockResolvedValue(okResponse());
    await driver.executeCommand(device, { deviceId: device.id, capability: "textEntry", args: { text: "a b" } });

    const keypressUrls = (global.fetch as jest.Mock).mock.calls.slice(3).map((call) => call[0]);
    expect(keypressUrls).toEqual([
      "http://192.168.1.80:8060/keypress/Lit_a",
      "http://192.168.1.80:8060/keypress/Lit_%20",
      "http://192.168.1.80:8060/keypress/Lit_b",
    ]);
  }, 10000);

  test("textEntry rejects an empty string without any network call", async () => {
    await connectRoku(driver);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "textEntry", args: { text: "" } })).rejects.toThrow(
      /non-empty string/
    );
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(3);
  });
});
