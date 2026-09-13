import { XboxDriver } from "./XboxDriver";
import { Device } from "../../../core/types/Device";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

// Same reasoning as httpRelayFallback.test.ts: mocked rather than imported for real — the real
// module pulls in AsyncStorage/SecureStore, native modules this Jest environment doesn't have.
jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const device: Device = {
  id: "xbox-1",
  name: "Living Room Xbox",
  category: "gaming",
  manufacturer: "Microsoft",
  driverId: "xbox-smartglass",
  capabilities: [],
  config: { liveId: "FD0000000000ABCD", ipAddress: "192.168.1.210" },
};

describe("XboxDriver", () => {
  let driver: XboxDriver;

  beforeEach(() => {
    driver = new XboxDriver();
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
  });

  test("declares only powerOn — power-off and media control need a full authenticated SmartGlass session this driver doesn't implement", () => {
    expect(driver.getCapabilities()).toEqual(["powerOn"]);
  });

  test("connect() does not send any network request — probing an off console has no side-effect-free mechanism", async () => {
    await driver.connect(device);
    expect(global.fetch).not.toHaveBeenCalled();
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
  });

  test("connect() throws for a device missing its liveId, without touching the network", async () => {
    const unconfigured: Device = { ...device, config: {} };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/liveId/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("powerOn relays the liveId and IP to Family Command Center's Xbox endpoint", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sent: true }));

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "powerOn" });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/xbox/poweron",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        body: JSON.stringify({ liveId: "FD0000000000ABCD", ipAddress: "192.168.1.210" }),
      })
    );
    expect(result.success).toBe(true);
  });

  test("powerOn without Family Command Center configured fails clearly rather than silently no-opping", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "powerOn" })).rejects.toThrow(/Family Command Center/);
  });

  test("a rejected token surfaces a clear error, not a generic HTTP status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "powerOn" })).rejects.toThrow(/rejected the saved token/);
  });

  test("any other capability throws — this driver only ever implements powerOn", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/does not implement/);
  });
});
