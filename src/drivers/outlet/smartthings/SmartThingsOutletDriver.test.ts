import { RefreshAccessToken, SmartThingsOutletDriver, SMARTTHINGS_OUTLET_DRIVER_ID } from "./SmartThingsOutletDriver";
import { Device } from "../../../core/types/Device";
import { loadSmartThingsConfig, saveSmartThingsConfig } from "../../../discovery/smartThingsConfig";

jest.mock("../../../discovery/smartThingsConfig");
const mockLoadConfig = loadSmartThingsConfig as jest.MockedFunction<typeof loadSmartThingsConfig>;
const mockSaveConfig = saveSmartThingsConfig as jest.MockedFunction<typeof saveSmartThingsConfig>;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const device: Device = {
  id: "outlet-1",
  name: "Living Room Lamp",
  category: "outlet",
  manufacturer: "SmartThings",
  driverId: SMARTTHINGS_OUTLET_DRIVER_ID,
  capabilities: [],
  config: { deviceId: "st-device-1" },
};

const FRESH_CONFIG = { accessToken: "fresh-access", refreshToken: "refresh-1", expiresAt: Date.now() + 60 * 60 * 1000 };

describe("SmartThingsOutletDriver", () => {
  let driver: SmartThingsOutletDriver;
  let refreshAccessToken: jest.MockedFunction<RefreshAccessToken>;

  beforeEach(() => {
    refreshAccessToken = jest.fn();
    driver = new SmartThingsOutletDriver(refreshAccessToken);
    global.fetch = jest.fn();
    mockLoadConfig.mockReset();
    mockSaveConfig.mockReset();
  });

  test("declares only power — the whole capability set an outlet has", () => {
    expect(driver.getCapabilities()).toEqual(["power"]);
  });

  test("connect() reads the real switch state without needing a refresh when the token is fresh", async () => {
    mockLoadConfig.mockResolvedValue(FRESH_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ switch: { value: "on" } }));

    await driver.connect(device);

    expect((await driver.getState(device))).toMatchObject({ connection: "connected", values: { power: "on" } });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  test("connect() refreshes the token first when it's expired, then persists the new one", async () => {
    mockLoadConfig.mockResolvedValue({ accessToken: "stale-access", refreshToken: "refresh-1", expiresAt: Date.now() - 1000 });
    refreshAccessToken.mockResolvedValue({ accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 86400 });
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ switch: { value: "off" } }));

    await driver.connect(device);

    expect(refreshAccessToken).toHaveBeenCalledWith("refresh-1");
    expect(mockSaveConfig).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "new-access", refreshToken: "new-refresh" }));
    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer new-access" }) }));
  });

  test("connect() throws a clear error when SmartThings was never connected at all", async () => {
    mockLoadConfig.mockResolvedValue(null);

    await expect(driver.connect(device)).rejects.toThrow(/isn't connected yet/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("power command toggles from the current cached state and sends the right SmartThings command", async () => {
    mockLoadConfig.mockResolvedValue(FRESH_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ switch: { value: "off" } }));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.state?.power).toBe("on");
    expect(global.fetch).toHaveBeenLastCalledWith(
      "https://api.smartthings.com/v1/devices/st-device-1/commands",
      expect.objectContaining({ body: JSON.stringify({ commands: [{ component: "main", capability: "switch", command: "on" }] }) })
    );
  });

  test("executeCommand throws for any capability other than power", async () => {
    mockLoadConfig.mockResolvedValue(FRESH_CONFIG);
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" })).rejects.toThrow(/does not implement/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("a failed command marks the device disconnected", async () => {
    mockLoadConfig.mockResolvedValue(FRESH_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ switch: { value: "on" } }));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 500));
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow();

    expect((await driver.getState(device)).connection).toBe("disconnected");
  });
});
