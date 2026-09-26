import { AndroidTvDriver, ANDROID_TV_DRIVER_ID, PAIRING_REQUIRED_VALUE_KEY } from "./AndroidTvDriver";
import { AndroidTvRelayError } from "./AndroidTvClient";
import { Device } from "../../../core/types/Device";
import { findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../../discovery/familyCommandCenterDeviceLookup";
import { sendWakeOnLan } from "../../../core/network/wakeOnLan";

// Reconnect delays carry random jitter; drop it so the exact-delay assertions below stay exact.
jest.mock("../../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));

const mockGetStatus = jest.fn();
const mockSendKey = jest.fn();
const mockLaunchApp = jest.fn();
const mockSendText = jest.fn();
jest.mock("./AndroidTvClient", () => {
  const actual = jest.requireActual("./AndroidTvClient");
  return {
    ...actual,
    AndroidTvClient: jest.fn().mockImplementation(() => ({ getStatus: mockGetStatus, sendKey: mockSendKey, launchApp: mockLaunchApp, sendText: mockSendText })),
  };
});

jest.mock("../../../discovery/familyCommandCenterDeviceLookup", () => ({
  findCurrentIpByMac: jest.fn(),
  findCurrentIpByBrand: jest.fn(async () => undefined), findCurrentIpByName: jest.fn(),
  findMacByIp: jest.fn(),
}));
jest.mock("../../../core/network/wakeOnLan", () => ({ sendWakeOnLan: jest.fn() }));
const mockFindIpByMac = findCurrentIpByMac as jest.MockedFunction<typeof findCurrentIpByMac>;
const mockFindIpByName = findCurrentIpByName as jest.MockedFunction<typeof findCurrentIpByName>;
const mockFindMacByIp = findMacByIp as jest.MockedFunction<typeof findMacByIp>;
const mockWake = sendWakeOnLan as jest.MockedFunction<typeof sendWakeOnLan>;

const IP = "192.168.1.91";
const MAC = "aa:bb:cc:dd:ee:ff";

function makeDevice(config: Record<string, unknown> = { ipAddress: IP, hwaddr: MAC }): Device {
  return { id: "atvr-1", name: "Living Room TV", category: "streaming", manufacturer: "Google", driverId: ANDROID_TV_DRIVER_ID, capabilities: [], config };
}

const UNREACHABLE = new AndroidTvRelayError("unreachable", "no route", 502);
const NOT_PAIRED = new AndroidTvRelayError("not_paired", "pair first", 409);

describe("AndroidTvDriver", () => {
  let driver: AndroidTvDriver;
  let device: Device;

  beforeEach(() => {
    jest.useFakeTimers();
    driver = new AndroidTvDriver();
    device = makeDevice();
    [mockGetStatus, mockSendKey, mockLaunchApp, mockSendText, mockFindIpByMac, mockFindIpByName, mockFindMacByIp, mockWake].forEach((mock) => mock.mockReset());
  });

  afterEach(async () => {
    await driver.disconnect(device);
    jest.useRealTimers();
  });

  test("declares honest capabilities: keys, launch and text, but no absolute volume, channel or input", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(expect.arrayContaining(["power", "volumeUp", "volumeDown", "mute", "directionalNavigation", "select", "home", "back", "playPause", "launchApp", "textEntry"]));
    for (const missing of ["setVolume", "setChannel", "inputSelection", "channelUp"] as const) expect(caps).not.toContain(missing);
  });

  test("connect() reads real power state and foreground app", async () => {
    mockGetStatus.mockResolvedValueOnce({ isOn: false, currentApp: "com.google.android.apps.tv.launcherx" });

    await driver.connect(device);

    expect(mockGetStatus).toHaveBeenCalledWith(IP);
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values).toMatchObject({ power: "off", currentApp: "com.google.android.apps.tv.launcherx" });
  });

  test("connect() shares one in-flight status read between concurrent callers", async () => {
    mockGetStatus.mockResolvedValue({ isOn: true, currentApp: null });

    await Promise.all([driver.connect(device), driver.connect(device)]);

    expect(mockGetStatus).toHaveBeenCalledTimes(1);
  });

  test("an unreachable TV is disconnected and retried with growing backoff until it answers", async () => {
    mockGetStatus.mockRejectedValue(UNREACHABLE);
    await expect(driver.connect(device)).rejects.toBe(UNREACHABLE);
    expect((await driver.getState(device)).connection).toBe("disconnected");

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
    mockGetStatus.mockResolvedValue({ isOn: true, currentApp: null });
    await jest.advanceTimersByTimeAsync(4000);

    expect(mockGetStatus).toHaveBeenCalledTimes(3);
    expect((await driver.getState(device)).connection).toBe("connected");
  });

  test("a TV that needs pairing is flagged and never retried", async () => {
    mockGetStatus.mockRejectedValue(NOT_PAIRED);

    await expect(driver.connect(device)).rejects.toBe(NOT_PAIRED);
    await jest.advanceTimersByTimeAsync(60000);

    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect((await driver.getState(device)).values[PAIRING_REQUIRED_VALUE_KEY]).toBe(true);
  });

  test("self-heals a moved TV by MAC and saves the new address", async () => {
    mockGetStatus.mockRejectedValueOnce(UNREACHABLE).mockResolvedValueOnce({ isOn: true, currentApp: null });
    mockFindIpByMac.mockResolvedValueOnce("192.168.1.99");

    await driver.connect(device);

    expect(mockFindIpByMac).toHaveBeenCalledWith(MAC);
    expect(mockGetStatus).toHaveBeenLastCalledWith("192.168.1.99");
    expect(device.config?.ipAddress).toBe("192.168.1.99");
  });

  test("looks a moved TV up by name when no MAC is saved and backfills the MAC", async () => {
    device = makeDevice({ ipAddress: IP });
    mockGetStatus.mockRejectedValueOnce(UNREACHABLE).mockResolvedValueOnce({ isOn: true, currentApp: null });
    mockFindIpByName.mockResolvedValueOnce("192.168.1.98");
    mockFindMacByIp.mockResolvedValueOnce(MAC);

    await driver.connect(device);

    expect(device.config).toMatchObject({ ipAddress: "192.168.1.98", hwaddr: MAC });
  });

  test.each([
    ["select", {}, "CENTER"],
    ["home", {}, "HOME"],
    ["back", {}, "BACK"],
    ["volumeUp", {}, "VOLUME_UP"],
    ["volumeDown", {}, "VOLUME_DOWN"],
    ["mute", {}, "MUTE"],
    ["playPause", {}, "MEDIA_PLAY_PAUSE"],
    ["directionalNavigation", { direction: "left" }, "DPAD_LEFT"],
  ] as const)("%s sends the %s allowlisted key", async (capability, args, key) => {
    mockSendKey.mockResolvedValueOnce(undefined);

    const result = await driver.executeCommand(device, { capability, args, deviceId: device.id });

    expect(mockSendKey).toHaveBeenCalledWith(IP, key);
    expect(result.success).toBe(true);
    expect((await driver.getState(device)).connection).toBe("connected");
  });

  test("launchApp maps a service name and passes an explicit package id through", async () => {
    await driver.executeCommand(device, { capability: "launchApp", args: { service: "primeVideo" }, deviceId: device.id });
    await driver.executeCommand(device, { capability: "launchApp", args: { appId: "com.plexapp.android" }, deviceId: device.id });

    expect(mockLaunchApp).toHaveBeenNthCalledWith(1, IP, { service: "primeVideo" });
    expect(mockLaunchApp).toHaveBeenNthCalledWith(2, IP, { appId: "com.plexapp.android" });
    await expect(driver.executeCommand(device, { capability: "launchApp", args: { service: "tiktok" }, deviceId: device.id })).rejects.toThrow("launchApp requires");
  });

  test("textEntry sends the text and rejects an empty string", async () => {
    await driver.executeCommand(device, { capability: "textEntry", args: { text: "the office" }, deviceId: device.id });
    expect(mockSendText).toHaveBeenCalledWith(IP, "the office");
    await expect(driver.executeCommand(device, { capability: "textEntry", args: { text: "" }, deviceId: device.id })).rejects.toThrow("non-empty");
  });

  test("power reads state and presses POWER once when the TV is reachable", async () => {
    mockGetStatus.mockResolvedValueOnce({ isOn: true, currentApp: null });

    const result = await driver.executeCommand(device, { capability: "power", deviceId: device.id });

    expect(mockSendKey).toHaveBeenCalledTimes(1);
    expect(mockSendKey).toHaveBeenCalledWith(IP, "POWER");
    expect(result.state?.power).toBe("off");
    expect(mockWake).not.toHaveBeenCalled();
  });

  test("power on an unreachable TV sends Wake-on-LAN, shows waking and reconnects fast", async () => {
    mockGetStatus.mockRejectedValueOnce(UNREACHABLE);

    const result = await driver.executeCommand(device, { capability: "power", deviceId: device.id });

    expect(mockWake).toHaveBeenCalledWith(MAC);
    expect(mockSendKey).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect((await driver.getState(device)).values.waking).toBe(true);

    mockGetStatus.mockResolvedValue({ isOn: true, currentApp: null });
    await jest.advanceTimersByTimeAsync(2000);

    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values).toMatchObject({ power: "on", waking: false });
  });

  test("power on an unreachable TV with no known MAC explains why it cannot wake", async () => {
    device = makeDevice({ ipAddress: IP });
    mockGetStatus.mockRejectedValue(UNREACHABLE);
    mockFindMacByIp.mockResolvedValue(undefined);

    await expect(driver.executeCommand(device, { capability: "power", deviceId: device.id })).rejects.toThrow("no known MAC address");
    expect(mockWake).not.toHaveBeenCalled();
  });

  test("a failed key press marks the TV disconnected and starts the backoff loop", async () => {
    mockSendKey.mockRejectedValueOnce(UNREACHABLE);
    mockGetStatus.mockResolvedValue({ isOn: true, currentApp: null });

    await expect(driver.executeCommand(device, { capability: "home", deviceId: device.id })).rejects.toBe(UNREACHABLE);
    expect((await driver.getState(device)).connection).toBe("disconnected");

    await jest.advanceTimersByTimeAsync(2000);
    expect((await driver.getState(device)).connection).toBe("connected");
  });

  test("throws for a capability it does not declare", async () => {
    await expect(driver.executeCommand(device, { capability: "setVolume", args: { volume: 5 }, deviceId: device.id })).rejects.toThrow("does not implement");
  });

  test("a device without an address is rejected with a pair-first message", async () => {
    await expect(driver.connect(makeDevice({}))).rejects.toThrow("missing Android TV config");
  });
});
