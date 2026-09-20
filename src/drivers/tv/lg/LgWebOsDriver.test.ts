import { LgWebOsDriver, LG_WEBOS_DRIVER_ID } from "./LgWebOsDriver";
import { flushMicrotasks, installMockWebSocket, MockWebSocket } from "../../../testUtils/mockWebSocket";
import { Device } from "../../../core/types/Device";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";
import { sendWakeOnLan } from "../../../core/network/wakeOnLan";

jest.mock("../../../discovery/familyCommandCenterConfig");
jest.mock("../../../core/network/wakeOnLan");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;
const mockSendWakeOnLan = sendWakeOnLan as jest.MockedFunction<typeof sendWakeOnLan>;

const device: Device = {
  id: "lg-1",
  name: "Bedroom LG",
  category: "tv",
  manufacturer: "LG",
  driverId: LG_WEBOS_DRIVER_ID,
  capabilities: [],
  config: { ipAddress: "192.168.1.70" },
};

/** Drives the mock socket through: open -> register handshake -> paired -> connect()'s own getVolume, getExternalInputList, and listLaunchPoints (ADR-HEARTH-078) reads. */
async function connectDriver(driver: LgWebOsDriver): Promise<void> {
  const connectPromise = driver.connect(device);
  const socket = MockWebSocket.latest();
  socket.simulateOpen();
  await flushMicrotasks();
  const registerSent = JSON.parse(socket.sentMessages[0]);
  socket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "test-key" } });

  await flushMicrotasks(); // let connect()'s internal refreshVolumeState() send its request
  const volumeRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
  socket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 15, mute: false } });

  await flushMicrotasks(); // let refreshVolumeState resolve and refreshInputList send its own request
  const inputListRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
  socket.simulateMessage({
    type: "response",
    id: inputListRequest.id,
    payload: { returnValue: true, devices: [{ id: "HDMI_1", label: "HDMI 1" }, { id: "HDMI_2", label: "HDMI 2" }] },
  });

  await flushMicrotasks(); // let refreshInputList resolve and refreshApps send its own request
  const appsRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
  socket.simulateMessage({
    type: "response",
    id: appsRequest.id,
    payload: { returnValue: true, launchPoints: [{ id: "netflix", title: "Netflix" }] },
  });

  await connectPromise;
}

describe("LgWebOsDriver", () => {
  let driver: LgWebOsDriver;

  beforeEach(() => {
    installMockWebSocket();
    driver = new LgWebOsDriver();
    mockLoadConfig.mockReset(); // defaults to undefined — matches every existing test's "no relay configured" world unless a test opts in
    mockSendWakeOnLan.mockReset().mockResolvedValue(undefined);
    global.fetch = jest.fn();
  });

  test("declares powerOff, powerOn (via Wake-on-LAN, ADR-HEARTH-102), and inputSelection but not the single-toggle 'power' (honest about what SSAP can/can't do)", () => {
    const caps = driver.getCapabilities();
    expect(caps).toContain("powerOff");
    expect(caps).toContain("powerOn");
    expect(caps).not.toContain("power");
    expect(caps).toContain("inputSelection");
  });

  test("powerOn sends a real Wake-on-LAN packet using the device's saved MAC, with no live connection required", async () => {
    const offDevice: Device = { ...device, config: { ipAddress: "192.168.1.70", hwaddr: "F8:B9:5A:43:7E:3E" } };

    const result = await driver.executeCommand(offDevice, { deviceId: offDevice.id, capability: "powerOn" });

    expect(mockSendWakeOnLan).toHaveBeenCalledWith("F8:B9:5A:43:7E:3E");
    expect(result.success).toBe(true);
    expect(result.state?.lastAction).toBe("powerOn");
  });

  test("powerOn without any known MAC address fails clearly rather than silently no-opping", async () => {
    const offDevice: Device = { ...device, config: { ipAddress: "192.168.1.70" } };
    mockLoadConfig.mockResolvedValue(null); // Family Command Center unconfigured -- findMacByIp can't fall back either

    await expect(driver.executeCommand(offDevice, { deviceId: offDevice.id, capability: "powerOn" })).rejects.toThrow(/no known MAC address/);
    expect(mockSendWakeOnLan).not.toHaveBeenCalled();
  });

  test("connect() pairs and reads back initial volume state and the real input list (real-hardware ask, 2026-09-10: \"there also needs to be an input button\")", async () => {
    await connectDriver(driver);
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values).toMatchObject({ power: "on", volume: 15, muted: false });
    // connectDriver's mock TV responds to getExternalInputList with two real-shaped inputs.
    expect(state.values.inputs).toEqual([
      { id: "HDMI_1", label: "HDMI 1" },
      { id: "HDMI_2", label: "HDMI 2" },
    ]);
  });

  test("filters 'Sling TV' out of the real input list at the source (ADR-HEARTH-060 — a second consumer of state.values.inputs, CreateSceneScreen, was showing it again because the old filter only lived inside UniversalTvRemote.tsx's own render)", async () => {
    const connectPromise = driver.connect(device);
    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();
    const registerSent = JSON.parse(socket.sentMessages[0]);
    socket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "test-key" } });

    await flushMicrotasks();
    const volumeRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 15, mute: false } });

    await flushMicrotasks();
    const inputListRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({
      type: "response",
      id: inputListRequest.id,
      payload: {
        returnValue: true,
        devices: [
          { id: "HDMI_1", label: "HDMI 1" },
          { id: "SLING", label: "Sling TV" },
          { id: "HDMI_2", label: "HDMI 2" },
        ],
      },
    });

    await flushMicrotasks();
    const appsRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: appsRequest.id, payload: { returnValue: true, launchPoints: [] } });

    await connectPromise;
    const state = await driver.getState(device);
    expect(state.values.inputs).toEqual([
      { id: "HDMI_1", label: "HDMI 1" },
      { id: "HDMI_2", label: "HDMI 2" },
    ]);
  });

  test("textEntry calls ssap://com.webos.service.ime/insertText with the whole string in one request (ADR-HEARTH-072)", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "textEntry", args: { text: "user@example.com" } });
    const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    expect(sent.uri).toBe("ssap://com.webos.service.ime/insertText");
    expect(sent.payload).toEqual({ text: "user@example.com", replace: 0 });
    socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true } });

    await resultPromise;
  });

  test("textEntry rejects an empty string without sending anything", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();
    const sentBefore = socket.sentMessages.length;

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "textEntry", args: { text: "" } })).rejects.toThrow(/non-empty string/);
    expect(socket.sentMessages.length).toBe(sentBefore);
  });

  test("inputSelection calls ssap://tv/switchInput with the chosen input's real id", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "HDMI_2" } });
    const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    expect(sent.uri).toBe("ssap://tv/switchInput");
    expect(sent.payload).toEqual({ inputId: "HDMI_2" });
    socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true } });

    const result = await resultPromise;
    expect(result.state?.input).toBe("HDMI_2");
  });

  test("a TV that rejects getExternalInputList still finishes connecting, just without a populated input list", async () => {
    const connectPromise = driver.connect(device);
    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();
    const registerSent = JSON.parse(socket.sentMessages[0]);
    socket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "test-key" } });

    await flushMicrotasks();
    const volumeRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 15, mute: false } });

    await flushMicrotasks();
    const inputListRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "error", id: inputListRequest.id, error: "403 access denied" });

    await flushMicrotasks();
    const appsRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: appsRequest.id, payload: { returnValue: true, launchPoints: [] } });

    await connectPromise;
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected"); // the failure is contained, not fatal to connect()
    expect(state.values.inputs).toBeUndefined();
  });

  test("connect() still finishes if listLaunchPoints itself fails — the app list just stays unset (ADR-HEARTH-078)", async () => {
    const connectPromise = driver.connect(device);
    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();
    const registerSent = JSON.parse(socket.sentMessages[0]);
    socket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "test-key" } });

    await flushMicrotasks();
    const volumeRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 15, mute: false } });

    await flushMicrotasks();
    const inputListRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: inputListRequest.id, payload: { returnValue: true, devices: [] } });

    await flushMicrotasks();
    const appsRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "error", id: appsRequest.id, error: "403 access denied" });

    await connectPromise;
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.apps).toBeUndefined();
  });

  test("connect() populates state.values.apps from a real listLaunchPoints response", async () => {
    await connectDriver(driver);
    const state = await driver.getState(device);
    expect(state.values.apps).toEqual([{ id: "netflix", name: "Netflix" }]);
  });

  test("connect() writes the pairing key it receives into device.config, so App.tsx can persist it and skip the on-screen prompt next time (real-hardware ask, 2026-09-10)", async () => {
    await connectDriver(driver); // connectDriver's mock TV responds with client-key: "test-key"
    expect(device.config?.clientKey).toBe("test-key");
  });

  test("executeCommand throws if the device was never connected", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "powerOff" })).rejects.toThrow(/not connected/);
  });

  test("powerOff sends ssap://system/turnOff and optimistically marks power off", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "powerOff" });
    const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    expect(sent.uri).toBe("ssap://system/turnOff");
    socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true } });

    const result = await resultPromise;
    expect(result.state?.power).toBe("off");
  });

  test("volumeUp calls ssap://audio/volumeUp then re-reads real volume from the TV", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });
    const upSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    expect(upSent.uri).toBe("ssap://audio/volumeUp");
    socket.simulateMessage({ type: "response", id: upSent.id, payload: { returnValue: true } });

    await Promise.resolve();
    const readSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    expect(readSent.uri).toBe("ssap://audio/getVolume");
    socket.simulateMessage({ type: "response", id: readSent.id, payload: { returnValue: true, volume: 17, mute: false } });

    const result = await resultPromise;
    expect(result.state?.volume).toBe(17);
  });

  test("launchApp('netflix') calls ssap://system.launcher/launch with the real webOS app id (real-hardware research, 2026-09-10)", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });
    const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    expect(sent.uri).toBe("ssap://system.launcher/launch");
    expect(sent.payload).toEqual({ id: "netflix" });
    socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true } });

    await resultPromise;
  });

  test("launchApp with an unsupported service throws without sending anything", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();
    const sentBefore = socket.sentMessages.length;

    await expect(
      driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "disneyPlus" } })
    ).rejects.toThrow(/supported 'service'/);
    expect(socket.sentMessages.length).toBe(sentBefore);
  });

  // ADR-HEARTH-078: launchApp can target any installed app directly by id (e.g. one from
  // state.values.apps — the recent-apps row), not just the four fixed streaming services, and
  // reports lastLaunchedAppId regardless of which arg triggered it (same pattern as Roku's
  // identical extension, ADR-HEARTH-076) so the UI's recent-apps history stays brand-agnostic.
  test("launchApp launches any app by id, not just the four fixed streaming services", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { appId: "com.some.app" } });
    const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    expect(sent.uri).toBe("ssap://system.launcher/launch");
    expect(sent.payload).toEqual({ id: "com.some.app" });
    socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true } });

    const result = await resultPromise;
    expect(result.state?.lastLaunchedAppId).toBe("com.some.app");
  });

  test("launchApp reports lastLaunchedAppId as the real resolved id when launched via 'service'", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });
    const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true } });

    const result = await resultPromise;
    expect(result.state?.lastLaunchedAppId).toBe("netflix");
  });

  test("launchApp requires either a service or an appId, not neither", async () => {
    await connectDriver(driver);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "launchApp" })).rejects.toThrow(/supported 'service' or 'appId'/);
  });

  test("directionalNavigation opens the pointer socket and sends the mapped button", async () => {
    await connectDriver(driver);
    const mainSocket = MockWebSocket.at(0);

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation", args: { direction: "up" } });
    const getSocketRequest = JSON.parse(mainSocket.sentMessages[mainSocket.sentMessages.length - 1]);
    mainSocket.simulateMessage({ type: "response", id: getSocketRequest.id, payload: { returnValue: true, socketPath: "wss://192.168.1.70:3001/pointer" } });
    await Promise.resolve(); // let getPointerSocket()'s continuation construct the new WebSocket

    const pointerSocket = MockWebSocket.at(1);
    pointerSocket.simulateOpen();

    await resultPromise;
    expect(pointerSocket.sentMessages[0]).toBe("type:button\nname:UP\n\n");
  });

  test("setChannel sends each digit as a separate button press over the pointer socket, in order", async () => {
    await connectDriver(driver);
    const mainSocket = MockWebSocket.at(0);

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: 142 } });
    const getSocketRequest = JSON.parse(mainSocket.sentMessages[mainSocket.sentMessages.length - 1]);
    mainSocket.simulateMessage({ type: "response", id: getSocketRequest.id, payload: { returnValue: true, socketPath: "wss://192.168.1.70:3001/pointer" } });
    await Promise.resolve();

    const pointerSocket = MockWebSocket.at(1);
    pointerSocket.simulateOpen();

    const result = await resultPromise;
    expect(pointerSocket.sentMessages).toEqual(["type:button\nname:1\n\n", "type:button\nname:4\n\n", "type:button\nname:2\n\n"]);
    expect(result.state?.channel).toBe(142);
  }, 10000);

  test("setChannel rejects a non-numeric channel arg without sending anything", async () => {
    await connectDriver(driver);
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: "12" } })).rejects.toThrow(
      /numeric 'channel'/
    );
  });

  describe("playback state (ADR-HEARTH-051, real-hardware research)", () => {
    test("declares playPause and opens a live playback-state subscription right after connect", async () => {
      expect(driver.getCapabilities()).toContain("playPause");
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      expect(sent.type).toBe("subscribe");
      expect(sent.uri).toBe("ssap://com.webos.media/getForegroundAppInfo");
    });

    test("a pushed playState update populates live playbackState", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const subscribeSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);

      socket.simulateMessage({
        type: "response",
        id: subscribeSent.id,
        payload: { returnValue: true, foregroundAppInfo: [{ appId: "netflix", playState: "playing" }] },
      });
      await flushMicrotasks();

      expect((await driver.getState(device)).values.playbackState).toBe("playing");
    });

    test("the same subscription id keeps delivering further pushes — a real live subscription, not a one-shot request", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const subscribeSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);

      socket.simulateMessage({ type: "response", id: subscribeSent.id, payload: { returnValue: true, foregroundAppInfo: [{ playState: "playing" }] } });
      await flushMicrotasks();
      expect((await driver.getState(device)).values.playbackState).toBe("playing");

      socket.simulateMessage({ type: "response", id: subscribeSent.id, payload: { returnValue: true, foregroundAppInfo: [{ playState: "paused" }] } });
      await flushMicrotasks();
      expect((await driver.getState(device)).values.playbackState).toBe("paused");
    });

    test("an unrecognized/transitional playState (e.g. 'starting') and no foreground media both collapse to 'stopped'", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const subscribeSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);

      socket.simulateMessage({ type: "response", id: subscribeSent.id, payload: { returnValue: true, foregroundAppInfo: [{ playState: "starting" }] } });
      await flushMicrotasks();
      expect((await driver.getState(device)).values.playbackState).toBe("stopped");

      socket.simulateMessage({ type: "response", id: subscribeSent.id, payload: { returnValue: true, foregroundAppInfo: [] } });
      await flushMicrotasks();
      expect((await driver.getState(device)).values.playbackState).toBe("stopped");
    });

    test("connect() still succeeds even when this firmware rejects the subscription outright (real, documented gap on some older webOS versions)", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const subscribeSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);

      socket.simulateMessage({ type: "error", id: subscribeSent.id, error: "404 not found" });

      const state = await driver.getState(device);
      expect(state.connection).toBe("connected"); // the subscription failing is contained, not fatal
      expect(state.values.playbackState).toBeUndefined();
    });

    test("playPause sends media.controls/play when no real state is known yet, then reflects the optimistic flip immediately", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();

      const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });
      const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      expect(sent.uri).toBe("ssap://media.controls/play");
      socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true } });

      const result = await resultPromise;
      expect(result.state?.playbackState).toBe("playing");
    });

    test("playPause sends media.controls/pause once real state is known to be playing (opposite of Roku's single toggle key)", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const subscribeSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      socket.simulateMessage({ type: "response", id: subscribeSent.id, payload: { returnValue: true, foregroundAppInfo: [{ playState: "playing" }] } });
      await flushMicrotasks();

      const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "playPause" });
      const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      expect(sent.uri).toBe("ssap://media.controls/pause");
      socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true } });

      const result = await resultPromise;
      expect(result.state?.playbackState).toBe("paused");
    });
  });

  describe("command-history playback approximation (real-hardware finding, 2026-09-13)", () => {
    /**
     * Completes a select/home button press. `getPointerSocket()` caches and reuses an already-open
     * pointer socket, so only the *first* press in a test actually sends a fresh
     * getPointerInputSocket request on the main socket — later presses go straight to the cached
     * pointer socket with no new main-socket message at all.
     */
    async function pressButton(capability: "select" | "home") {
      const mainSocket = MockWebSocket.at(0);
      const mainMessagesBefore = mainSocket.sentMessages.length;
      const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability });
      await flushMicrotasks();
      if (mainSocket.sentMessages.length > mainMessagesBefore) {
        const getSocketRequest = JSON.parse(mainSocket.sentMessages[mainSocket.sentMessages.length - 1]);
        mainSocket.simulateMessage({ type: "response", id: getSocketRequest.id, payload: { returnValue: true, socketPath: "wss://192.168.1.70:3001/pointer" } });
        await flushMicrotasks();
        MockWebSocket.latest().simulateOpen();
      }
      return resultPromise;
    }

    test("select does nothing to playbackState when no streaming app was launched first", async () => {
      await connectDriver(driver);
      const result = await pressButton("select");
      expect(result.state?.playbackState).toBeUndefined();
    });

    test("launchApp lands on the app's own browse screen — playbackState stays 'stopped', not 'playing'", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });
      const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true } });
      const result = await resultPromise;
      expect(result.state?.playbackState).toBe("stopped");
    });

    test("the FIRST select after launching a streaming app stays on Select — real-hardware finding, 2026-09-13: this is almost always a profile picker, not a title", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const launchPromise = driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });
      const launchSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      socket.simulateMessage({ type: "response", id: launchSent.id, payload: { returnValue: true } });
      await launchPromise;

      const result = await pressButton("select");
      expect(result.state?.playbackState).toBe("stopped");
    });

    test("the SECOND select after launching flips the center button to play/pause", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const launchPromise = driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });
      const launchSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      socket.simulateMessage({ type: "response", id: launchSent.id, payload: { returnValue: true } });
      await launchPromise;
      await pressButton("select"); // profile picker

      const result = await pressButton("select"); // actual title
      expect(result.state?.playbackState).toBe("playing");
    });

    test("home resets both the streaming-app assumption and playbackState back to Select", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const launchPromise = driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });
      const launchSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      socket.simulateMessage({ type: "response", id: launchSent.id, payload: { returnValue: true } });
      await launchPromise;
      await pressButton("select"); // profile picker
      await pressButton("select"); // now "playing"

      const homeResult = await pressButton("home");
      expect(homeResult.state?.playbackState).toBe("stopped");

      // The streaming-app assumption AND the select-press count are both cleared — a single
      // select press now, with no fresh launchApp in between, should not flip back to "playing".
      const selectResult = await pressButton("select");
      expect(selectResult.state?.playbackState).toBe("stopped");
    });

    test("inputSelection (e.g. switching to HDMI) resets playbackState the same way home does", async () => {
      await connectDriver(driver);
      const socket = MockWebSocket.latest();
      const launchPromise = driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });
      const launchSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      socket.simulateMessage({ type: "response", id: launchSent.id, payload: { returnValue: true } });
      await launchPromise;
      await pressButton("select"); // profile picker
      await pressButton("select"); // now "playing"

      const inputPromise = driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "HDMI_1" } });
      const inputSent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
      socket.simulateMessage({ type: "response", id: inputSent.id, payload: { returnValue: true } });
      const inputResult = await inputPromise;
      expect(inputResult.state?.playbackState).toBe("stopped");
    });
  });

  test("auto-reconnects after an unexpected disconnect, without any caller action (Sean's 'should never lose connection' ask, 2026-09-09)", async () => {
    await connectDriver(driver);
    expect((await driver.getState(device)).connection).toBe("connected");

    // Simulate the transport dropping on its own — not driver.disconnect(), which is the
    // deliberate path and must NOT trigger a reconnect.
    MockWebSocket.latest().close();
    expect((await driver.getState(device)).connection).toBe("disconnected");

    // The driver's own backoff timer (RECONNECT_BASE_DELAY_MS = 2000ms) fires connect() again
    // on its own — drive that second connection through the same handshake, unprompted by the
    // test itself, proving this really is automatic.
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const secondSocket = MockWebSocket.latest();
    secondSocket.simulateOpen();
    await flushMicrotasks();
    const registerSent = JSON.parse(secondSocket.sentMessages[0]);
    secondSocket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "test-key-2" } });
    await flushMicrotasks();
    const volumeRequest = JSON.parse(secondSocket.sentMessages[secondSocket.sentMessages.length - 1]);
    secondSocket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 15, mute: false } });
    await flushMicrotasks();
    const inputListRequest = JSON.parse(secondSocket.sentMessages[secondSocket.sentMessages.length - 1]);
    secondSocket.simulateMessage({ type: "response", id: inputListRequest.id, payload: { returnValue: true, devices: [{ id: "HDMI_1", label: "HDMI 1" }] } });
    await flushMicrotasks();

    expect((await driver.getState(device)).connection).toBe("connected");
  }, 10000);

  test("a connect() that fails outright — not just a post-connection drop — still gets auto-retried in the background (Sean, twice: 'it needs to never ever again disconnect')", async () => {
    // Nothing has ever connected yet — the very first attempt fails (e.g. the TV rejecting a
    // stale client-key and timing out, or any other connect()-time failure).
    const firstAttempt = driver.connect(device);
    MockWebSocket.latest().simulateError();
    await expect(firstAttempt).rejects.toThrow();
    expect((await driver.getState(device)).connection).not.toBe("connected");

    // No caller does anything else — the driver's own backoff timer (RECONNECT_BASE_DELAY_MS =
    // 2000ms) should fire connect() again on its own, exactly like a post-connection drop does.
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const secondSocket = MockWebSocket.latest();
    expect(secondSocket).not.toBe(undefined);
    secondSocket.simulateOpen();
    await flushMicrotasks();
    const registerSent = JSON.parse(secondSocket.sentMessages[0]);
    secondSocket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "test-key-3" } });
    await flushMicrotasks();
    const volumeRequest = JSON.parse(secondSocket.sentMessages[secondSocket.sentMessages.length - 1]);
    secondSocket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 10, mute: false } });
    await flushMicrotasks();
    const inputListRequest = JSON.parse(secondSocket.sentMessages[secondSocket.sentMessages.length - 1]);
    secondSocket.simulateMessage({ type: "response", id: inputListRequest.id, payload: { returnValue: true, devices: [] } });
    await flushMicrotasks();

    expect((await driver.getState(device)).connection).toBe("connected");
  }, 10000);

  describe("re-discovery after a network change (real-hardware finding, 2026-09-10, Sean: \"no matter what the device wifi is on\")", () => {
    const deviceWithMac: Device = { ...device, config: { ipAddress: "10.20.30.40", hwaddr: "AA:BB:CC:DD:EE:FF" } };

    test("re-locates the device by MAC through Family Command Center and connects at its new address", async () => {
      mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ devices: [{ hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.218" }] }),
      });

      const connectPromise = driver.connect(deviceWithMac);

      // Old address fails both directly and via relay — the exact sequence that produces
      // LgUnreachableError (both legs of openSocketWithRelayFallback exhausted).
      const directSocket = MockWebSocket.latest();
      expect(directSocket.url).toBe("wss://10.20.30.40:3001");
      directSocket.simulateError();
      await flushMicrotasks();
      const relaySocket = MockWebSocket.latest();
      expect(relaySocket).not.toBe(directSocket);
      relaySocket.simulateError();
      // The recovery path chains several more microtask hops than a plain handshake (catching
      // LgUnreachableError, then awaiting the mocked fetch() *and* its own .json() call before a
      // new socket is even created) — the default flushMicrotasks() ticks aren't enough to settle
      // all of that before the next assertion.
      await flushMicrotasks(20);

      // The driver looks itself up by MAC (mocked fetch above) and retries at the new address.
      const retrySocket = MockWebSocket.latest();
      expect(retrySocket.url).toBe("wss://192.168.1.218:3001");
      retrySocket.simulateOpen();
      await flushMicrotasks();
      const registerSent = JSON.parse(retrySocket.sentMessages[0]);
      retrySocket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "rediscovered-key" } });
      await flushMicrotasks();
      const volumeRequest = JSON.parse(retrySocket.sentMessages[retrySocket.sentMessages.length - 1]);
      retrySocket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 20, mute: false } });
      await flushMicrotasks();
      const inputListRequest = JSON.parse(retrySocket.sentMessages[retrySocket.sentMessages.length - 1]);
      retrySocket.simulateMessage({ type: "response", id: inputListRequest.id, payload: { returnValue: true, devices: [] } });
      await flushMicrotasks();
      const appsRequest = JSON.parse(retrySocket.sentMessages[retrySocket.sentMessages.length - 1]);
      retrySocket.simulateMessage({ type: "response", id: appsRequest.id, payload: { returnValue: true, launchPoints: [] } });
      await flushMicrotasks();

      await connectPromise;
      expect((await driver.getState(deviceWithMac)).connection).toBe("connected");
      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.218"); // updated in place, same as a fresh client-key
    });

    // Real-hardware finding (2026-09-10), live during a "reconnect still isn't working" report:
    // this recovery originally only fired on LgUnreachableError (socket never opens). Live logs
    // showed the actual failure at the stale IP was a normal pairing-timeout — the socket opened
    // fine (something else now answers at that address after DHCP handed it out again once the
    // TV left) but never completed the SSAP register handshake. That was invisible to the old
    // instanceof check, so the driver just retried the same wrong IP forever. Uses its own device
    // object rather than `deviceWithMac` above, which the first test in this describe already
    // mutates in place to "192.168.1.218" — reusing it here would start from the wrong premise.
    test("re-discovery ALSO triggers on a pairing-timeout failure at the stale address, not just an outright-unreachable one", async () => {
      jest.useFakeTimers();
      try {
        const deviceAtStaleIp: Device = { ...device, config: { ipAddress: "10.20.30.40", hwaddr: "AA:BB:CC:DD:EE:FF" } };
        mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ devices: [{ hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.218" }] }),
        });

        const connectPromise = driver.connect(deviceAtStaleIp);

        const staleSocket = MockWebSocket.latest();
        expect(staleSocket.url).toBe("wss://10.20.30.40:3001");
        staleSocket.simulateOpen(); // opens fine — something else answers, not the TV
        await flushMicrotasks();
        jest.advanceTimersByTime(30000); // register never arrives — pairing-timeout, not LgUnreachableError
        await flushMicrotasks(20);

        const retrySocket = MockWebSocket.latest();
        expect(retrySocket.url).toBe("wss://192.168.1.218:3001");
        retrySocket.simulateOpen();
        await flushMicrotasks();
        const registerSent = JSON.parse(retrySocket.sentMessages[0]);
        retrySocket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "rediscovered-key-2" } });
        await flushMicrotasks();
        const volumeRequest = JSON.parse(retrySocket.sentMessages[retrySocket.sentMessages.length - 1]);
        retrySocket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 5, mute: false } });
        await flushMicrotasks();
        const inputListRequest = JSON.parse(retrySocket.sentMessages[retrySocket.sentMessages.length - 1]);
        retrySocket.simulateMessage({ type: "response", id: inputListRequest.id, payload: { returnValue: true, devices: [] } });
        await flushMicrotasks();
        const appsRequest = JSON.parse(retrySocket.sentMessages[retrySocket.sentMessages.length - 1]);
        retrySocket.simulateMessage({ type: "response", id: appsRequest.id, payload: { returnValue: true, launchPoints: [] } });
        await flushMicrotasks();

        await connectPromise;
        expect((await driver.getState(deviceAtStaleIp)).connection).toBe("connected");
        expect(deviceAtStaleIp.config?.ipAddress).toBe("192.168.1.218");
      } finally {
        jest.useRealTimers();
      }
    });

    test("a device with no saved hwaddr and no Family Command Center configured just fails normally — nothing to look up", async () => {
      const manualDevice: Device = { ...device, config: { ipAddress: "10.20.30.40" } }; // no hwaddr

      const connectPromise = driver.connect(manualDevice);
      MockWebSocket.latest().simulateError();
      await flushMicrotasks();

      await expect(connectPromise).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled(); // FCC isn't configured (mockLoadConfig defaults unconfigured) — nothing to call

      // The failed connect() schedules a real background retry timer (by design, this session's
      // own fix) — cancel it before the test ends so it can't fire during a later, unrelated test
      // and corrupt its MockWebSocket state, the same reason other tests in this file explicitly
      // disconnect() when a scheduled reconnect isn't the thing under test.
      await driver.disconnect(manualDevice);
    });

    // Real-hardware finding (2026-09-10): the actual device stuck in Sean's live "reconnect still
    // isn't working" report had no hwaddr at all (discovered before ADR-HEARTH-017 started saving
    // one) — findCurrentIpByMac could never help it no matter how many failure types it reacted
    // to. This is the fallback that actually fixes that exact device: matching on the name
    // discovery already gave it (set from the Center's own reported hostname).
    test("a device with no saved hwaddr falls back to a name-based lookup and re-locates itself", async () => {
      const deviceWithNoMac: Device = { ...device, name: "LGwebOSTV.lan", config: { ipAddress: "10.20.30.40" } };
      mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ devices: [{ hwaddr: "11:22:33:44:55:66", ip: "192.168.1.218", name: "LGwebOSTV.lan" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ devices: [{ hwaddr: "11:22:33:44:55:66", ip: "192.168.1.218", name: "LGwebOSTV.lan" }] }),
        });

      const connectPromise = driver.connect(deviceWithNoMac);
      const directSocket = MockWebSocket.latest();
      directSocket.simulateError();
      await flushMicrotasks();
      const relaySocket = MockWebSocket.latest();
      relaySocket.simulateError();
      await flushMicrotasks(20);

      const retrySocket = MockWebSocket.latest();
      expect(retrySocket.url).toBe("wss://192.168.1.218:3001");
      retrySocket.simulateOpen();
      await flushMicrotasks();
      const registerSent = JSON.parse(retrySocket.sentMessages[0]);
      retrySocket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "name-matched-key" } });
      await flushMicrotasks();
      const volumeRequest = JSON.parse(retrySocket.sentMessages[retrySocket.sentMessages.length - 1]);
      retrySocket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 8, mute: false } });
      await flushMicrotasks();
      const inputListRequest = JSON.parse(retrySocket.sentMessages[retrySocket.sentMessages.length - 1]);
      retrySocket.simulateMessage({ type: "response", id: inputListRequest.id, payload: { returnValue: true, devices: [] } });
      await flushMicrotasks();
      const appsRequest = JSON.parse(retrySocket.sentMessages[retrySocket.sentMessages.length - 1]);
      retrySocket.simulateMessage({ type: "response", id: appsRequest.id, payload: { returnValue: true, launchPoints: [] } });
      await flushMicrotasks();

      await connectPromise;
      expect((await driver.getState(deviceWithNoMac)).connection).toBe("connected");
      expect(deviceWithNoMac.config?.ipAddress).toBe("192.168.1.218");
      // Backfilled going forward — the next stale-IP case for this device uses the faster MAC lookup.
      expect(deviceWithNoMac.config?.hwaddr).toBe("11:22:33:44:55:66");
    });
  });

  test("disconnect() does not trigger a reconnect (deliberate close, not a drop)", async () => {
    await connectDriver(driver);
    await driver.disconnect(device);

    // If a reconnect were (wrongly) scheduled, waiting past its delay and checking for a new
    // socket attempt proves it didn't happen.
    const socketCountBefore = MockWebSocket.instances.length;
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(MockWebSocket.instances.length).toBe(socketCountBefore);
    expect((await driver.getState(device)).connection).toBe("disconnected");
  }, 10000);

  test("a stale in-flight reconnect attempt can't resurrect state after disconnect() runs mid-retry (real-hardware finding, 2026-09-09)", async () => {
    await connectDriver(driver);

    // Drop the connection — schedules an auto-reconnect (RECONNECT_BASE_DELAY_MS = 2000ms).
    MockWebSocket.latest().close();
    await new Promise((resolve) => setTimeout(resolve, 2100));

    // The scheduled reconnect's connect() has now started and opened a new socket, but its
    // handshake hasn't completed yet — this is the exact in-flight window the finding describes.
    const staleSocket = MockWebSocket.latest();
    expect(staleSocket.sentMessages).toHaveLength(0); // register not sent until socket opens

    // The user removes the device while that attempt is still awaiting its handshake.
    await driver.disconnect(device);
    expect((await driver.getState(device)).connection).toBe("disconnected");

    // Now let the stale attempt's handshake actually succeed — it must not be able to write
    // "connected" state or register a client for a device that's since been disconnected.
    staleSocket.simulateOpen();
    await flushMicrotasks();
    const registerSent = JSON.parse(staleSocket.sentMessages[0]);
    staleSocket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "stale-key" } });
    await flushMicrotasks();

    expect((await driver.getState(device)).connection).toBe("disconnected");
    // Sending a command must still fail with "not connected" — the stale attempt's client was
    // never registered into the driver's live client map.
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "powerOff" })).rejects.toThrow(/not connected/);
  }, 10000);

  test("two concurrent connect() calls for the same device share one socket instead of opening a second (real-hardware finding, 2026-09-09)", async () => {
    // Confirmed live via Family Command Center's relay logs: the real TV's SSAP socket doesn't
    // reject a second simultaneous connection attempt, it just hangs until timeout — this is
    // exactly what happens when App.tsx's several independent reconnect triggers (startup,
    // AppState foreground resume, opening the remote screen) land close together.
    const firstConnect = driver.connect(device);
    const secondConnect = driver.connect(device); // fired before the first has any chance to resolve

    expect(MockWebSocket.instances).toHaveLength(1); // not 2 — the second call didn't open its own socket

    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();
    const registerSent = JSON.parse(socket.sentMessages[0]);
    socket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "test-key" } });
    await flushMicrotasks();
    const volumeRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 15, mute: false } });

    await flushMicrotasks();
    const inputListRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: inputListRequest.id, payload: { returnValue: true, devices: [{ id: "HDMI_1", label: "HDMI 1" }] } });

    await flushMicrotasks();
    const appsRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    socket.simulateMessage({ type: "response", id: appsRequest.id, payload: { returnValue: true, launchPoints: [] } });

    await Promise.all([firstConnect, secondConnect]); // both resolve successfully off the one real attempt
    expect((await driver.getState(device)).connection).toBe("connected");
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
