import { Device } from "../core/types/Device";
import { NetworkDevice } from "./discoverAll";
import { buildDiscoveryRows, findAddedDevice, notYetAdded, reidentify } from "./discoveryRows";

function net(overrides: Partial<NetworkDevice>): NetworkDevice {
  return { id: "n", ip: "192.168.1.10", mac: null, hostname: null, vendor: null, brand: null, model: null, confidence: "unknown", evidence: [], online: true, kind: null, friendlyName: null, hidden: false, labelBrand: null, ...overrides };
}

function saved(config: Record<string, unknown>): Device {
  return { id: "s", name: "Saved", category: "tv", manufacturer: "x", driverId: "d", capabilities: [], config };
}

describe("buildDiscoveryRows", () => {
  const devices = [
    net({ id: "1", ip: "192.168.1.30", hostname: "printer", vendor: "HP" }),
    net({ id: "2", ip: "192.168.1.20", brand: "roku", confidence: "certain", model: "Ultra" }),
    net({ id: "3", ip: "192.168.1.5", brand: "lg", confidence: "likely", hostname: "LGwebOSTV" }),
    net({ id: "4", ip: "192.168.1.40" }),
  ];

  test("puts identified devices first and never hides unknown ones", () => {
    const rows = buildDiscoveryRows(devices, []);
    expect(rows.identified.map((r) => r.device.id)).toEqual(["3", "2"]);
    expect(rows.other.map((r) => r.device.id)).toEqual(["1", "4"]);
  });

  test("recognized rows say Add, unknown rows say Identify", () => {
    const rows = buildDiscoveryRows(devices, []);
    expect(rows.identified.every((r) => r.action === "add")).toBe(true);
    expect(rows.other.every((r) => r.action === "identify")).toBe(true);
  });

  test("identified rows show brand and model; other rows show hostname, vendor and ip", () => {
    const rows = buildDiscoveryRows(devices, []);
    expect(rows.identified.find((r) => r.device.id === "2")).toMatchObject({ title: "Roku · Ultra", subtitle: "192.168.1.20 · Answered as Roku" });
    expect(rows.other.find((r) => r.device.id === "1")).toMatchObject({ title: "printer", subtitle: "192.168.1.30 · HP" });
    expect(rows.other.find((r) => r.device.id === "4")?.title).toBe("Unknown device");
  });

  test("devices already added are marked Added, matched by ip or mac, not removed", () => {
    const rows = buildDiscoveryRows([net({ id: "a", ip: "192.168.1.20", brand: "roku" }), net({ id: "b", ip: "192.168.1.99", mac: "aa:bb:cc:dd:ee:ff" })], [
      saved({ ipAddress: "192.168.1.20" }),
      saved({ hwaddr: "AA:BB:CC:DD:EE:FF" }),
    ]);
    const all = [...rows.identified, ...rows.other];
    expect(all).toHaveLength(2);
    expect(all.every((r) => r.action === "added")).toBe(true);
  });

  test("a Pi-recognized Google TV (mDNS _androidtvremote2) becomes an Add row that opens the guided pairing screen", () => {
    const rows = buildDiscoveryRows([net({ id: "g", ip: "192.168.1.91", brand: "androidtv", confidence: "certain", friendlyName: "Living Room TV" })], []);
    expect(rows.identified[0]).toMatchObject({ action: "add", title: "Living Room TV", subtitle: "192.168.1.91 · Answered as Google TV / Android TV" });
    expect(rows.identified[0].brand).toMatchObject({ id: "androidtv", addMode: "custom-screen" });
  });

  test("a Hue bridge address counts as added", () => {
    expect(findAddedDevice(net({ ip: "192.168.1.7" }), [saved({ bridgeIpAddress: "192.168.1.7" })])).toBeDefined();
  });

  test("notYetAdded lists identified first and skips added ones", () => {
    const rows = buildDiscoveryRows(devices, [saved({ ipAddress: "192.168.1.5" })]);
    expect(notYetAdded(rows).map((r) => r.device.id)).toEqual(["2", "1", "4"]);
  });
});

describe("reidentify", () => {
  const unknownRow = buildDiscoveryRows([net({ ip: "192.168.1.60" })], []).other[0];

  test("returns the sighting once a rescan gives it a brand", async () => {
    const found = await reidentify(unknownRow, async () => [net({ ip: "192.168.1.60", brand: "samsung", confidence: "likely" })]);
    expect(found?.brand).toBe("samsung");
  });

  test("returns null when it is still unknown or has vanished", async () => {
    expect(await reidentify(unknownRow, async () => [net({ ip: "192.168.1.60" })])).toBeNull();
    expect(await reidentify(unknownRow, async () => [])).toBeNull();
  });
});
