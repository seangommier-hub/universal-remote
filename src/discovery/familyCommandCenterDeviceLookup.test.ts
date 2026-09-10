import { findCurrentIpByMac, findMacByIp } from "./familyCommandCenterDeviceLookup";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

jest.mock("./familyCommandCenterConfig");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

describe("findCurrentIpByMac", () => {
  beforeEach(() => {
    mockLoadConfig.mockReset();
    global.fetch = jest.fn();
  });

  test("returns the current IP for a device matching the given MAC, case-insensitively", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        devices: [
          { hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.50" },
          { hwaddr: "11:22:33:44:55:66", ip: "192.168.1.218" },
        ],
      }),
    });

    const ip = await findCurrentIpByMac("11:22:33:44:55:66");

    expect(ip).toBe("192.168.1.218");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/devices",
      expect.objectContaining({ headers: { Authorization: "Bearer test-token" } })
    );
  });

  test("returns undefined when no device matches", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [] }) });

    expect(await findCurrentIpByMac("aa:bb:cc:dd:ee:ff")).toBeUndefined();
  });

  test("returns undefined (not a throw) when Family Command Center isn't configured", async () => {
    mockLoadConfig.mockResolvedValue(null);

    expect(await findCurrentIpByMac("aa:bb:cc:dd:ee:ff")).toBeUndefined();
  });

  test("returns undefined (not a throw) when the request fails", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network unreachable"));

    expect(await findCurrentIpByMac("aa:bb:cc:dd:ee:ff")).toBeUndefined();
  });

  test("returns undefined (not a throw) on a non-OK response", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

    expect(await findCurrentIpByMac("aa:bb:cc:dd:ee:ff")).toBeUndefined();
  });
});

describe("findMacByIp", () => {
  beforeEach(() => {
    mockLoadConfig.mockReset();
    global.fetch = jest.fn();
  });

  test("returns the MAC address of the device currently at the given IP", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        devices: [
          { hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.50" },
          { hwaddr: "11:22:33:44:55:66", ip: "192.168.1.218" },
        ],
      }),
    });

    expect(await findMacByIp("192.168.1.218")).toBe("11:22:33:44:55:66");
  });

  test("returns undefined when no device is known at that IP", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [] }) });

    expect(await findMacByIp("192.168.1.218")).toBeUndefined();
  });

  test("returns undefined (not a throw) when Family Command Center isn't configured", async () => {
    mockLoadConfig.mockResolvedValue(null);

    expect(await findMacByIp("192.168.1.218")).toBeUndefined();
  });
});
