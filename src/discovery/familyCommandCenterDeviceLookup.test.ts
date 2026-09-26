import { findCurrentIpByIdentity, findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "./familyCommandCenterDeviceLookup";
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

// Real-hardware finding (2026-09-10): a device discovered before hwaddr-saving existed
// (ADR-HEARTH-017) has no MAC on file, so findCurrentIpByMac can never re-locate it — this
// hostname-based fallback exists for exactly that legacy case.
describe("findCurrentIpByName", () => {
  beforeEach(() => {
    mockLoadConfig.mockReset();
    global.fetch = jest.fn();
  });

  test("returns the current IP for a device matching the given name, case-insensitively", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        devices: [
          { hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.50", name: "SonyTV.lan" },
          { hwaddr: "11:22:33:44:55:66", ip: "192.168.1.218", name: "LGwebOSTV.lan" },
        ],
      }),
    });

    expect(await findCurrentIpByName("lgwebostv.lan")).toBe("192.168.1.218");
  });

  test("returns undefined when no device has a matching name", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ devices: [{ hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.50", name: null }] }),
    });

    expect(await findCurrentIpByName("LGwebOSTV.lan")).toBeUndefined();
  });

  test("returns undefined (not a throw) when Family Command Center isn't configured", async () => {
    mockLoadConfig.mockResolvedValue(null);

    expect(await findCurrentIpByName("LGwebOSTV.lan")).toBeUndefined();
  });
});

describe("findCurrentIpByIdentity (ADR-HEARTH-156)", () => {
  const inventory = {
    ok: true,
    json: async () => ({
      devices: [
        { hwaddr: "aa:bb:cc:dd:ee:01", ip: "192.168.1.50", name: "Den TV", uuid: null },
        { hwaddr: "aa:bb:cc:dd:ee:02", ip: "192.168.1.61", name: "lgwebostv", uuid: "UUID-7" },
      ],
    }),
  };

  beforeEach(() => {
    mockLoadConfig.mockReset();
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "t" });
    global.fetch = jest.fn().mockResolvedValue(inventory);
  });

  test("uses the MAC when there is one", async () => {
    expect(await findCurrentIpByIdentity({ hwaddr: "AA:BB:CC:DD:EE:01", uuid: "UUID-7" }, "x")).toBe("192.168.1.50");
  });

  test("falls back to the UUID when there is no MAC", async () => {
    expect(await findCurrentIpByIdentity({ uuid: "uuid-7" }, "x")).toBe("192.168.1.61");
  });

  test("falls back to the saved name when there is neither, or the UUID is unknown", async () => {
    expect(await findCurrentIpByIdentity({}, "Den TV")).toBe("192.168.1.50");
    expect(await findCurrentIpByIdentity({ uuid: "nope" }, "Den TV")).toBe("192.168.1.50");
  });
});
