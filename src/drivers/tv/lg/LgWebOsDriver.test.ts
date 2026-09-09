import { LgWebOsDriver, LG_WEBOS_DRIVER_ID } from "./LgWebOsDriver";
import { installMockWebSocket, MockWebSocket } from "../../../testUtils/mockWebSocket";
import { Device } from "../../../core/types/Device";

const device: Device = {
  id: "lg-1",
  name: "Bedroom LG",
  category: "tv",
  manufacturer: "LG",
  driverId: LG_WEBOS_DRIVER_ID,
  capabilities: [],
  config: { ipAddress: "192.168.1.70" },
};

/** Drives the mock socket through: open -> register handshake -> paired -> connect()'s own getVolume read. */
async function connectDriver(driver: LgWebOsDriver): Promise<void> {
  const connectPromise = driver.connect(device);
  const socket = MockWebSocket.latest();
  socket.simulateOpen();
  const registerSent = JSON.parse(socket.sentMessages[0]);
  socket.simulateMessage({ type: "registered", id: registerSent.id, payload: { "client-key": "test-key" } });

  await Promise.resolve(); // let connect()'s internal refreshVolumeState() send its request
  const volumeRequest = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
  socket.simulateMessage({ type: "response", id: volumeRequest.id, payload: { returnValue: true, volume: 15, mute: false } });

  await connectPromise;
}

describe("LgWebOsDriver", () => {
  let driver: LgWebOsDriver;

  beforeEach(() => {
    installMockWebSocket();
    driver = new LgWebOsDriver();
  });

  test("declares powerOff but not power/powerOn/inputSelection/setVolume-free capabilities honestly", () => {
    const caps = driver.getCapabilities();
    expect(caps).toContain("powerOff");
    expect(caps).not.toContain("power");
    expect(caps).not.toContain("powerOn");
    expect(caps).not.toContain("inputSelection");
  });

  test("connect() pairs and reads back initial volume state", async () => {
    await connectDriver(driver);
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values).toMatchObject({ power: "on", volume: 15, muted: false });
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

  test("directionalNavigation opens the pointer socket and sends the mapped button", async () => {
    await connectDriver(driver);
    const mainSocket = MockWebSocket.at(0);

    const resultPromise = driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation", args: { direction: "up" } });
    const getSocketRequest = JSON.parse(mainSocket.sentMessages[mainSocket.sentMessages.length - 1]);
    mainSocket.simulateMessage({ type: "response", id: getSocketRequest.id, payload: { returnValue: true, socketPath: "ws://192.168.1.70:3000/pointer" } });
    await Promise.resolve(); // let getPointerSocket()'s continuation construct the new WebSocket

    const pointerSocket = MockWebSocket.at(1);
    pointerSocket.simulateOpen();

    await resultPromise;
    expect(pointerSocket.sentMessages[0]).toBe("type:button\nname:UP\n\n");
  });
});
