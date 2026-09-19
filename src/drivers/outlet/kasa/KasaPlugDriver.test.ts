import { KASA_PLUG_DRIVER_ID, KasaPlugDriver } from "./KasaPlugDriver";
import { Device } from "../../../core/types/Device";
import { getSysInfo, setRelayState } from "./KasaClient";

jest.mock("./KasaClient");
const mockGetSysInfo = getSysInfo as jest.MockedFunction<typeof getSysInfo>;
const mockSetRelayState = setRelayState as jest.MockedFunction<typeof setRelayState>;

const device: Device = {
  id: "kasa-1",
  name: "Christmas Lights",
  category: "outlet",
  manufacturer: "TP-Link",
  driverId: KASA_PLUG_DRIVER_ID,
  capabilities: [],
  config: { ipAddress: "192.168.1.50" },
};

describe("KasaPlugDriver", () => {
  let driver: KasaPlugDriver;

  beforeEach(() => {
    driver = new KasaPlugDriver();
    mockGetSysInfo.mockReset();
    mockSetRelayState.mockReset();
  });

  test("declares only power — no dimming or energy-monitor readback, even on plugs whose hardware supports it", () => {
    expect(driver.getCapabilities()).toEqual(["power"]);
  });

  test("connect() reads the real relay state and model straight from the plug", async () => {
    mockGetSysInfo.mockResolvedValue({ relayState: true, alias: "Christmas Lights", model: "HS103(US)" });

    await driver.connect(device);

    expect(await driver.getState(device)).toMatchObject({ connection: "connected", values: { power: "on", model: "HS103(US)" } });
  });

  // ADR-HEARTH-088: `alias` is the plug's own real, user-set name — already fetched by
  // getSysInfo() for `model` above, surfaced into state so the add/discovery flow can suggest it
  // instead of a generic default, the same pattern established for Roku (ADR-HEARTH-085).
  test("connect() surfaces the plug's real alias into state.values.deviceName", async () => {
    mockGetSysInfo.mockResolvedValue({ relayState: true, alias: "Christmas Lights", model: "HS103(US)" });

    await driver.connect(device);

    expect((await driver.getState(device)).values.deviceName).toBe("Christmas Lights");
  });

  test("connect() leaves deviceName unset when the plug reports no alias", async () => {
    mockGetSysInfo.mockResolvedValue({ relayState: true, model: "HS103(US)" });

    await driver.connect(device);

    expect((await driver.getState(device)).values.deviceName).toBeUndefined();
  });

  test("connect() reports power off correctly, not just a truthy check", async () => {
    mockGetSysInfo.mockResolvedValue({ relayState: false });

    await driver.connect(device);

    expect((await driver.getState(device)).values.power).toBe("off");
  });

  test("connect() leaves power unset (unknown) rather than guessing when relayState is genuinely missing", async () => {
    mockGetSysInfo.mockResolvedValue({ model: "HS103(US)" });

    await driver.connect(device);

    expect((await driver.getState(device)).values.power).toBeUndefined();
  });

  test("connect() throws and marks disconnected when the plug can't be reached (e.g. it's speaking KLAP, not this legacy protocol)", async () => {
    mockGetSysInfo.mockRejectedValue(new Error("Kasa device at 192.168.1.50 didn't respond with the expected legacy protocol — it may use newer TP-Link firmware this integration doesn't support yet."));

    await expect(driver.connect(device)).rejects.toThrow(/newer TP-Link firmware/);
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("power command toggles from the current cached state, sends the real command, and trusts the plug's own readback over the request", async () => {
    mockGetSysInfo.mockResolvedValueOnce({ relayState: false });
    await driver.connect(device);

    mockSetRelayState.mockResolvedValue(undefined);
    // The plug's own post-command readback is the source of truth, not an assumption the
    // requested state was reached — distinct from SmartThingsOutletDriver's optimistic toggle,
    // since this protocol actually offers a real readback to check.
    mockGetSysInfo.mockResolvedValueOnce({ relayState: true });
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(mockSetRelayState).toHaveBeenCalledWith("192.168.1.50", true);
    expect(result.state?.power).toBe("on");
  });

  test("if the plug's readback disagrees with what was requested, the readback wins", async () => {
    mockGetSysInfo.mockResolvedValueOnce({ relayState: false });
    await driver.connect(device);

    mockSetRelayState.mockResolvedValue(undefined);
    // Asked to turn on, but the plug's own post-command state still reports off (e.g. it
    // rejected the command) — the driver must report what's real, not what was requested.
    mockGetSysInfo.mockResolvedValueOnce({ relayState: false });
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.state?.power).toBe("off");
  });

  test("executeCommand throws for any capability other than power", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" })).rejects.toThrow(/does not implement/);
    expect(mockSetRelayState).not.toHaveBeenCalled();
  });

  test("a failed command marks the device disconnected", async () => {
    mockGetSysInfo.mockResolvedValueOnce({ relayState: true });
    await driver.connect(device);

    mockSetRelayState.mockRejectedValue(new Error("Family Command Center returned 502"));
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow();

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("requireConfig throws a clear error when config.ipAddress is missing", async () => {
    const unconfigured: Device = { ...device, config: {} };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/pair it first/);
  });
});
