import { findCurrentIpByBrand, findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "./familyCommandCenterDeviceLookup";
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

describe("findCurrentIpByBrand (ADR-HEARTH-169)", () => {
  const row = (ip: string, brand: string | null, extra: Record<string, unknown> = {}) => ({ ip, brand, confidence: "certain", online: true, ...extra });
  const respondWith = (devices: unknown[]) => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ devices }) });
  };

  beforeEach(() => {
    mockLoadConfig.mockReset();
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "t" });
    global.fetch = jest.fn();
  });

  test("returns the IP when exactly one device of that brand is discovered", async () => {
    respondWith([row("192.168.1.50", "sony"), row("192.168.1.60", "lg")]);
    expect(await findCurrentIpByBrand("sony", { excludeIps: [] })).toBe("192.168.1.50");
  });

  test("returns undefined when two devices of that brand are discovered", async () => {
    respondWith([row("192.168.1.50", "sony"), row("192.168.1.51", "sony")]);
    expect(await findCurrentIpByBrand("sony", { excludeIps: [] })).toBeUndefined();
  });

  test("ignores a candidate whose IP another saved device already uses", async () => {
    respondWith([row("192.168.1.50", "sony")]);
    expect(await findCurrentIpByBrand("sony", { excludeIps: ["192.168.1.50"] })).toBeUndefined();
  });

  test("an excluded second candidate leaves the remaining one unique", async () => {
    respondWith([row("192.168.1.50", "sony"), row("192.168.1.51", "sony")]);
    expect(await findCurrentIpByBrand("sony", { excludeIps: ["192.168.1.51"] })).toBe("192.168.1.50");
  });

  test("ignores offline and hidden rows", async () => {
    respondWith([row("192.168.1.50", "sony", { online: false }), row("192.168.1.51", "sony", { hidden: true })]);
    expect(await findCurrentIpByBrand("sony", { excludeIps: [] })).toBeUndefined();
  });

  test("returns undefined when the Family Command Center is unreachable", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));
    expect(await findCurrentIpByBrand("sony", { excludeIps: [] })).toBeUndefined();
  });

  test("returns undefined when the Family Command Center is not configured", async () => {
    mockLoadConfig.mockResolvedValue(null);
    expect(await findCurrentIpByBrand("sony", { excludeIps: [] })).toBeUndefined();
  });
});
