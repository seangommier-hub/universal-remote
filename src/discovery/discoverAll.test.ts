import { DiscoveredDevice } from "../core/discovery/DiscoveryProvider";
import { classifyNetworkFailure } from "../core/network/classifyNetworkFailure";
import { FccUnreachableError } from "../core/network/fccErrors";
import {
  discoverAll,
  DiscoverAllDependencies,
  DiscoverAllUnavailableError,
  fetchDiscoverAll,
  mergeNetworkDevices,
  NetworkDevice,
  networkDeviceFromDiscovered,
  parseNetworkDevice,
} from "./discoverAll";
import { FamilyCommandCenterConfig } from "./familyCommandCenterConfig";

const CONFIG: FamilyCommandCenterConfig = { baseUrl: "http://pi.local:3210", token: "t", publicBaseUrl: "https://pi.example.com" };

function device(overrides: Partial<NetworkDevice> = {}): NetworkDevice {
  return { id: "d1", ip: "192.168.1.10", mac: null, hostname: null, vendor: null, brand: null, model: null, confidence: "unknown", evidence: [], online: true, kind: null, friendlyName: null, hidden: false, labelBrand: null, ...overrides };
}

function deps(overrides: Partial<DiscoverAllDependencies>): DiscoverAllDependencies {
  return {
    loadConfig: async () => CONFIG,
    fetchAll: async () => [],
    fallbackScan: async () => ({ devices: [], failure: null }),
    ...overrides,
  };
}

describe("parseNetworkDevice", () => {
  test("keeps a well-formed identified row and lowercases the mac", () => {
    const parsed = parseNetworkDevice({ id: "a", ip: "10.0.0.5", mac: "AA:BB:CC:00:11:22", hostname: "tv", vendor: null, brand: "lg", model: "C1", confidence: "certain", evidence: ["ssdp"], online: true });
    expect(parsed).toMatchObject({ mac: "aa:bb:cc:00:11:22", brand: "lg", confidence: "certain", model: "C1" });
  });

  test("drops rows without an ip and downgrades an unknown brand string", () => {
    expect(parseNetworkDevice({ ip: "" })).toBeNull();
    expect(parseNetworkDevice(null)).toBeNull();
    expect(parseNetworkDevice({ ip: "10.0.0.6", brand: "toaster", confidence: "certain" })).toMatchObject({ brand: null, confidence: "unknown" });
  });

  test("carries a Home Assistant row's announced serviceUrl through, and defaults it to null when absent", () => {
    const withUrl = parseNetworkDevice({ ip: "10.0.0.7", brand: "homeassistant", confidence: "certain", serviceUrl: "http://10.0.0.7:8123/" });
    expect(withUrl).toMatchObject({ brand: "homeassistant", serviceUrl: "http://10.0.0.7:8123/" });
    expect(parseNetworkDevice({ ip: "10.0.0.8" })?.serviceUrl).toBeNull();
  });
});

describe("mergeNetworkDevices", () => {
  test("dedupes by ip, keeps the more confident brand, and fills blanks from the other sighting", () => {
    const merged = mergeNetworkDevices(
      [device({ brand: "lg", confidence: "likely", hostname: null })],
      [device({ brand: null, confidence: "unknown", hostname: "LGwebOSTV", mac: "aa:aa:aa:aa:aa:aa" })]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ brand: "lg", hostname: "LGwebOSTV", mac: "aa:aa:aa:aa:aa:aa" });
  });

  test("keeps distinct ips separate", () => {
    expect(mergeNetworkDevices([device()], [device({ ip: "192.168.1.11" })])).toHaveLength(2);
  });
});

describe("networkDeviceFromDiscovered", () => {
  const found: DiscoveredDevice = { id: "fcc-aa", name: "SonyTV.lan", category: "tv", manufacturer: "Sony", driverId: "sony-bravia", metadata: { ipAddress: "192.168.1.50", hwaddr: "AA:BB" } };

  test("maps a recognized legacy result to a brand", () => {
    expect(networkDeviceFromDiscovered(found)).toMatchObject({ ip: "192.168.1.50", brand: "sony", mac: "aa:bb", hostname: "SonyTV.lan", confidence: "likely" });
  });

  test("keeps an unrecognized one as unknown with its vendor", () => {
    const other = networkDeviceFromDiscovered({ ...found, driverId: "", manufacturer: "iRobot", name: "192.168.1.50" });
    expect(other).toMatchObject({ brand: null, vendor: "iRobot", hostname: null, confidence: "unknown" });
  });

  test("skips results with no address", () => {
    expect(networkDeviceFromDiscovered({ ...found, metadata: {} })).toBeNull();
  });
});

describe("discoverAll", () => {
  test("returns the endpoint's devices when it works", async () => {
    const result = await discoverAll(deps({ fetchAll: async () => [device({ brand: "roku" })] }));
    expect(result).toMatchObject({ source: "endpoint", failure: null });
    expect(result.devices).toHaveLength(1);
  });

  test("falls back silently when the Pi has no discover/all endpoint", async () => {
    const fallbackScan = jest.fn(async () => ({ devices: [device({ ip: "10.9.9.9" })], failure: null }));
    const result = await discoverAll(deps({ fetchAll: async () => { throw new DiscoverAllUnavailableError("404"); }, fallbackScan }));
    expect(fallbackScan).toHaveBeenCalled();
    expect(result).toMatchObject({ source: "fallback", failure: null });
  });

  test("falls back but reports a classified failure when the Pi cannot be reached", async () => {
    const result = await discoverAll(deps({ fetchAll: async () => { throw new FccUnreachableError("Network request failed"); } }));
    expect(result.source).toBe("fallback");
    expect(result.failure?.kind).toBe("lan-blocked");
    expect(result.devices).toEqual([]);
  });

  test("with no Family Command Center saved, uses the fallback and reports no failure", async () => {
    const fetchAll = jest.fn();
    const result = await discoverAll(deps({ loadConfig: async () => null, fetchAll }));
    expect(fetchAll).not.toHaveBeenCalled();
    expect(result.failure).toBeNull();
  });

  test("surfaces a fallback provider failure when the endpoint gave none", async () => {
    const failure = classifyNetworkFailure(new FccUnreachableError("x"));
    const result = await discoverAll(deps({ loadConfig: async () => null, fallbackScan: async () => ({ devices: [], failure }) }));
    expect(result.failure).toBe(failure);
  });
});

describe("fetchDiscoverAll", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function response(status: number, body: unknown = {}): Response {
    return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
  }

  test("sends the bearer token to the discover/all path and parses rows", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, { devices: [{ id: "x", ip: "10.0.0.2", brand: "sonos", confidence: "likely" }, { ip: "" }], scannedAt: "now" }));
    const devices = await fetchDiscoverAll(CONFIG);
    expect(global.fetch).toHaveBeenCalledWith("http://pi.local:3210/api/integrations/hearth/discover/all", expect.objectContaining({ headers: { Authorization: "Bearer t" } }));
    expect(devices).toHaveLength(1);
    expect(devices[0].brand).toBe("sonos");
  });

  test("maps a 404 to DiscoverAllUnavailableError", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(404));
    await expect(fetchDiscoverAll(CONFIG)).rejects.toBeInstanceOf(DiscoverAllUnavailableError);
  });

  test("tries the public address only when the home address cannot be reached", async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error("Network request failed")).mockResolvedValueOnce(response(200, { devices: [] }));
    await expect(fetchDiscoverAll(CONFIG)).resolves.toEqual([]);
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("https://pi.example.com/api/integrations/hearth/discover/all");
  });

  test("does not fall through to the public address when the token is rejected", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(401));
    await expect(fetchDiscoverAll(CONFIG)).rejects.toThrow(/rejected/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("parseNetworkDevice new fields (ADR-HEARTH-153)", () => {
  test("reads kind, friendlyName, hidden and labelBrand", () => {
    expect(parseNetworkDevice({ ip: "10.0.0.7", kind: "camera", friendlyName: " Front door ", hidden: true, labelBrand: "roku" })).toMatchObject({
      kind: "camera",
      friendlyName: "Front door",
      hidden: true,
      labelBrand: "roku",
    });
  });

  test("an older Pi that sends none of them still parses, with safe defaults", () => {
    expect(parseNetworkDevice({ ip: "10.0.0.8" })).toMatchObject({ kind: null, friendlyName: null, hidden: false, labelBrand: null });
  });

  test("ignores an unknown kind or brand instead of trusting it", () => {
    expect(parseNetworkDevice({ ip: "10.0.0.9", kind: "toaster", labelBrand: "toaster", hidden: "yes" })).toMatchObject({ kind: null, labelBrand: null, hidden: false });
  });

  test("merging keeps a kind and friendly name from either sighting", () => {
    const merged = mergeNetworkDevices([device({ kind: null })], [device({ kind: "tv", friendlyName: "Den TV" })]);
    expect(merged[0]).toMatchObject({ kind: "tv", friendlyName: "Den TV" });
  });
});
