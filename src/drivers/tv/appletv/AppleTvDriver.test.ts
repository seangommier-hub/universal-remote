import { AppleTvDriver, APPLE_TV_DRIVER_ID } from "./AppleTvDriver";
import { Device } from "../../../core/types/Device";

const mockSendCommand = jest.fn();
jest.mock("./AppleTvClient", () => ({
  AppleTvClient: jest.fn().mockImplementation(() => ({ sendCommand: mockSendCommand })),
}));

const device: Device = {
  id: "appletv-1",
  name: "Living Room Apple TV",
  category: "streaming",
  manufacturer: "Apple",
  driverId: APPLE_TV_DRIVER_ID,
  capabilities: [],
  config: { ipAddress: "192.168.1.90" },
};

describe("AppleTvDriver", () => {
  let driver: AppleTvDriver;

  beforeEach(() => {
    driver = new AppleTvDriver();
    mockSendCommand.mockReset();
  });

  test("declares a real toggleable power plus nav/volume/media capabilities, but not mute/setChannel/inputSelection (no atvremote equivalent)", () => {
    const caps = driver.getCapabilities();
    expect(caps).toContain("power");
    expect(caps).toContain("directionalNavigation");
    expect(caps).not.toContain("mute");
    expect(caps).not.toContain("setChannel");
    expect(caps).not.toContain("inputSelection");
  });

  test("connect() reads real power state from the device", async () => {
    mockSendCommand.mockResolvedValueOnce("PowerState.Off");

    await driver.connect(device);

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "power_state");
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.power).toBe("off");
  });

  test("connect() marks the device disconnected and rethrows when the device is unreachable", async () => {
    mockSendCommand.mockRejectedValueOnce(new Error("NoServiceError: no service available"));

    await expect(driver.connect(device)).rejects.toThrow(/NoServiceError/);
    const state = await driver.getState(device);
    expect(state.connection).toBe("disconnected");
  });

  test("power reads current state then sends the real opposite command — turn_off when currently on", async () => {
    mockSendCommand.mockResolvedValueOnce("PowerState.On").mockResolvedValueOnce("");

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(mockSendCommand).toHaveBeenNthCalledWith(1, "192.168.1.90", "power_state");
    expect(mockSendCommand).toHaveBeenNthCalledWith(2, "192.168.1.90", "turn_off");
    expect(result.state?.power).toBe("off");
  });

  test("power sends turn_on when currently off", async () => {
    mockSendCommand.mockResolvedValueOnce("PowerState.Off").mockResolvedValueOnce("");

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(mockSendCommand).toHaveBeenNthCalledWith(2, "192.168.1.90", "turn_on");
    expect(result.state?.power).toBe("on");
  });

  test("directionalNavigation sends the real up/down/left/right command", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation", args: { direction: "left" } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "left");
  });

  test("back sends the real menu command — Apple's own remote treats Menu as Back/Cancel", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "back" });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "menu");
  });

  test("setVolume sends the numeric level as a positional arg", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "setVolume", args: { volume: 42 } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "set_volume", ["42"]);
  });

  test("launchApp resolves a known streaming service to its real bundle id", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { service: "netflix" } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "launch_app", ["com.netflix.Netflix"]);
  });

  test("launchApp accepts a direct bundle id for an app with no fixed service mapping", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "launchApp", args: { appId: "com.example.SomeApp" } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "launch_app", ["com.example.SomeApp"]);
  });

  test("textEntry sends the string via text_append", async () => {
    mockSendCommand.mockResolvedValueOnce("");

    await driver.executeCommand(device, { deviceId: device.id, capability: "textEntry", args: { text: "hello" } });

    expect(mockSendCommand).toHaveBeenCalledWith("192.168.1.90", "text_append", ["hello"]);
  });

  test("an unsupported capability throws rather than silently no-opping", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "mute" })).rejects.toThrow(/does not implement/);
    expect(mockSendCommand).not.toHaveBeenCalled();
  });
});
