import { ALEXA_PLUG_DRIVER_ID, AlexaPlugDriver } from "./AlexaPlugDriver";
import { Device } from "../../../core/types/Device";
import { listPlugs, setPlugState } from "./AlexaPlugClient";
import { withBackoffJitter } from "../../shared/backoffJitter";

jest.mock("./AlexaPlugClient");
jest.mock("../../shared/backoffJitter");
const mockListPlugs = listPlugs as jest.MockedFunction<typeof listPlugs>;
const mockSetPlugState = setPlugState as jest.MockedFunction<typeof setPlugState>;
// Deterministic reconnect delay instead of pinning Math.random (matches SmartThingsOutletDriver's
// convention of testing the driver's own logic, not the jitter formula, which has its own test).
const mockWithBackoffJitter = withBackoffJitter as jest.MockedFunction<typeof withBackoffJitter>;

const device: Device = {
  id: "outlet-1",
  name: "Office Fan",
  category: "outlet",
  manufacturer: "Amazon",
  driverId: ALEXA_PLUG_DRIVER_ID,
  capabilities: [],
  config: { plugId: "alexa-device-1" },
};

describe("AlexaPlugDriver", () => {
  let driver: AlexaPlugDriver;

  beforeEach(() => {
    driver = new AlexaPlugDriver();
    mockListPlugs.mockReset();
    mockSetPlugState.mockReset();
    mockWithBackoffJitter.mockReset();
    mockWithBackoffJitter.mockImplementation((delayMs) => delayMs);
  });

  test("declares only power — the whole capability set a plug has", () => {
    expect(driver.getCapabilities()).toEqual(["power"]);
  });

  test("connect() reads the real on/off state from the Family Command Center's plug list", async () => {
    mockListPlugs.mockResolvedValue([{ id: "alexa-device-1", name: "Office Fan", manufacturer: "Amazon", on: true, reachable: true }]);

    await driver.connect(device);

    expect(await driver.getState(device)).toMatchObject({ connection: "connected", values: { power: "on" } });
  });

  test("connect() leaves power unset (rendered as unknown) when Amazon reports on: null -- never a false 'off'", async () => {
    mockListPlugs.mockResolvedValue([{ id: "alexa-device-1", name: "Office Fan", manufacturer: "Amazon", on: null, reachable: true }]);

    await driver.connect(device);

    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.power).toBeUndefined();
  });

  test("connect() throws and marks disconnected when the plug isn't in the Center's current list", async () => {
    mockListPlugs.mockResolvedValue([]);

    await expect(driver.connect(device)).rejects.toThrow(/isn't in Family Command Center/);
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("connect() throws and marks disconnected when Amazon reports the plug unreachable, even though the plug itself is known", async () => {
    mockListPlugs.mockResolvedValue([{ id: "alexa-device-1", name: "Office Fan", manufacturer: "Amazon", on: true, reachable: false }]);

    await expect(driver.connect(device)).rejects.toThrow(/isn't reachable through Alexa/);
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("connect() throws and marks disconnected when the Family Command Center call itself fails", async () => {
    mockListPlugs.mockRejectedValue(new Error("Family Command Center isn't paired yet"));

    await expect(driver.connect(device)).rejects.toThrow(/isn't paired yet/);
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("a failed connect schedules a reconnect using the shared backoff helper", async () => {
    jest.useFakeTimers();
    try {
      mockListPlugs.mockRejectedValueOnce(new Error("boom"));
      await expect(driver.connect(device)).rejects.toThrow();
      expect(mockWithBackoffJitter).toHaveBeenCalledWith(2000);

      mockListPlugs.mockResolvedValueOnce([{ id: "alexa-device-1", name: "Office Fan", manufacturer: "Amazon", on: true, reachable: true }]);
      await jest.advanceTimersByTimeAsync(2000);

      expect((await driver.getState(device)).connection).toBe("connected");
    } finally {
      jest.useRealTimers();
    }
  });

  test("power command toggles from the current cached state and sends the right Alexa command", async () => {
    mockListPlugs.mockResolvedValue([{ id: "alexa-device-1", name: "Office Fan", manufacturer: "Amazon", on: false, reachable: true }]);
    await driver.connect(device);

    mockSetPlugState.mockResolvedValue(undefined);
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.state?.power).toBe("on");
    expect(mockSetPlugState).toHaveBeenCalledWith("alexa-device-1", "on");
  });

  test("executeCommand throws for any capability other than power", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" })).rejects.toThrow(/does not implement/);
    expect(mockSetPlugState).not.toHaveBeenCalled();
  });

  test("a failed command marks the device disconnected", async () => {
    mockListPlugs.mockResolvedValue([{ id: "alexa-device-1", name: "Office Fan", manufacturer: "Amazon", on: true, reachable: true }]);
    await driver.connect(device);

    mockSetPlugState.mockRejectedValue(new Error("Family Command Center returned 502"));
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow();

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });
});
