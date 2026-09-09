import { FamilyCommandCenterDiscoveryProvider } from "./FamilyCommandCenterDiscoveryProvider";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { SONY_BRAVIA_DRIVER_ID } from "../drivers/tv/sony/SonyBraviaDriver";
import { LG_WEBOS_DRIVER_ID } from "../drivers/tv/lg/LgWebOsDriver";
import { ROKU_ECP_DRIVER_ID } from "../drivers/streaming/roku/RokuEcpDriver";

// An explicit factory, not bare jest.mock(path) -- automocking still
// requires the real module once to learn its shape, and that module
// imports AsyncStorage/SecureStore, whose native modules don't exist in
// this Jest environment (they throw synchronously on require, not just on
// use). A factory skips loading the real module at all.
jest.mock("./familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
  saveFamilyCommandCenterConfig: jest.fn(),
  clearFamilyCommandCenterConfig: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("FamilyCommandCenterDiscoveryProvider", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "secret-token" });
  });

  test("throws a clear error when no config is saved yet, without ever calling fetch", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    const provider = new FamilyCommandCenterDiscoveryProvider();

    await expect(provider.scan(() => {})).rejects.toThrow(/isn't connected yet/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("sends the saved bearer token to the correct endpoint", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ devices: [] }));
    const provider = new FamilyCommandCenterDiscoveryProvider();

    await provider.scan(() => {});

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/devices",
      expect.objectContaining({ headers: { Authorization: "Bearer secret-token" } })
    );
  });

  test("maps a recognized brand to its real driver and category", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        devices: [
          { hwaddr: "14:ac:60:00:f9:8d", ip: "192.168.1.50", name: "SonyTV.lan", vendor: null },
          { hwaddr: "f8:b9:5a:43:7e:3e", ip: "192.168.1.60", name: "LGwebOSTV.lan", vendor: "LG Innotek" },
          { hwaddr: "d4:ab:cd:3e:b0:25", ip: "192.168.1.70", name: "32HisenseRokuTV", vendor: null },
        ],
      })
    );
    const provider = new FamilyCommandCenterDiscoveryProvider();
    const found: { name: string; driverId: string; category: string }[] = [];

    await provider.scan((d) => found.push({ name: d.name, driverId: d.driverId, category: d.category }));

    expect(found).toEqual([
      { name: "SonyTV.lan", driverId: SONY_BRAVIA_DRIVER_ID, category: "tv" },
      { name: "LGwebOSTV.lan", driverId: LG_WEBOS_DRIVER_ID, category: "tv" },
      { name: "32HisenseRokuTV", driverId: ROKU_ECP_DRIVER_ID, category: "streaming" },
    ]);
  });

  test("still surfaces an unrecognized device, honestly unsupported rather than hidden", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ devices: [{ hwaddr: "aa:bb:cc:dd:ee:ff", ip: "192.168.1.99", name: "iRobot-vacuum", vendor: null }] })
    );
    const provider = new FamilyCommandCenterDiscoveryProvider();
    const found: { name: string; driverId: string; category: string }[] = [];

    await provider.scan((d) => found.push({ name: d.name, driverId: d.driverId, category: d.category }));

    expect(found).toEqual([{ name: "iRobot-vacuum", driverId: "", category: "other" }]);
  });

  test("throws a clear error on a rejected token (401)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    const provider = new FamilyCommandCenterDiscoveryProvider();

    await expect(provider.scan(() => {})).rejects.toThrow(/rejected/);
  });
});
