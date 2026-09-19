import { scanAllProviders } from "./scanAllProviders";
import { DiscoveredDevice, DiscoveryProvider } from "../core/discovery/DiscoveryProvider";

function fakeProvider(id: string, devices: DiscoveredDevice[], shouldThrow = false): DiscoveryProvider {
  return {
    id,
    displayName: id,
    async scan(onFound) {
      if (shouldThrow) throw new Error(`${id} failed`);
      devices.forEach(onFound);
    },
  };
}

const roku: DiscoveredDevice = {
  id: "ssdp-1",
  name: "Roku (192.168.1.50)",
  category: "streaming",
  manufacturer: "Roku",
  driverId: "roku-ecp",
  metadata: { ipAddress: "192.168.1.50" },
};

const rokuWithHwaddr: DiscoveredDevice = {
  ...roku,
  id: "fcc-aa:bb:cc",
  name: "LivingRoomRoku.lan",
  metadata: { ipAddress: "192.168.1.50", hwaddr: "AA:BB:CC:DD:EE:FF" },
};

describe("scanAllProviders", () => {
  test("merges results from multiple providers", async () => {
    const lg: DiscoveredDevice = { id: "ssdp-2", name: "LG", category: "tv", manufacturer: "LG", driverId: "lg-webos", metadata: { ipAddress: "192.168.1.60" } };
    const result = await scanAllProviders([fakeProvider("ssdp", [roku]), fakeProvider("fcc", [lg])]);

    expect(result).toHaveLength(2);
    expect(result.map((d) => d.manufacturer).sort()).toEqual(["LG", "Roku"]);
  });

  // ADR-HEARTH-095: SSDP has no hwaddr at all (IP only); Family Command Center does. The richer
  // entry must win so downstream duplicate-prevention (which matches by hwaddr, ADR-HEARTH-085)
  // still works for a device both sources happen to find.
  test("prefers the entry with an hwaddr when both sources find the same IP", async () => {
    const result = await scanAllProviders([fakeProvider("ssdp", [roku]), fakeProvider("fcc", [rokuWithHwaddr])]);

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.hwaddr).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("order doesn't matter — the hwaddr-bearing entry still wins even if it scans first", async () => {
    const result = await scanAllProviders([fakeProvider("fcc", [rokuWithHwaddr]), fakeProvider("ssdp", [roku])]);

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.hwaddr).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("one provider failing doesn't affect the other's results", async () => {
    const result = await scanAllProviders([fakeProvider("ssdp", [roku], true), fakeProvider("fcc", [rokuWithHwaddr])]);

    expect(result).toEqual([rokuWithHwaddr]);
  });

  test("both providers failing resolves to an empty list, never throws", async () => {
    await expect(scanAllProviders([fakeProvider("ssdp", [], true), fakeProvider("fcc", [], true)])).resolves.toEqual([]);
  });

  test("ignores a result with no IP at all — nothing to dedupe or connect to", async () => {
    const noIp: DiscoveredDevice = { id: "x", name: "?", category: "other", manufacturer: "?", driverId: "", metadata: {} };
    const result = await scanAllProviders([fakeProvider("ssdp", [noIp])]);

    expect(result).toEqual([]);
  });
});
