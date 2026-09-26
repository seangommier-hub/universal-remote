import { Device } from "../core/types/Device";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { NetworkDevice } from "./discoverAll";
import { buildListItems, buildSections, formatScannedAgo, ListItem, matchesQuery, pickScreenState, pickSuggested, shouldShowSearch } from "./discoverySections";
import { toDiscoveryRow } from "./discoveryRows";

let counter = 0;
function net(overrides: Partial<NetworkDevice>): NetworkDevice {
  counter += 1;
  return {
    id: `n${counter}`, ip: `192.168.1.${counter}`, mac: null, hostname: null, vendor: null, brand: null, model: null, confidence: "unknown",
    evidence: [], online: true, kind: null, friendlyName: null, hidden: false, labelBrand: null, ...overrides,
  };
}

function saved(ip: string): Device {
  return { id: "s", name: "Saved", category: "tv", manufacturer: "x", driverId: "d", capabilities: [], config: { ipAddress: ip } };
}

const failure: NetworkFailureDiagnosis = { kind: "lan-blocked", message: "m", summary: "s", fixes: [] };

/** A network shaped like the real household scan: 5 recognizable, the rest noise. */
function householdScan(): NetworkDevice[] {
  return [
    net({ brand: "lg", confidence: "certain", hostname: "LGwebOSTV", kind: "tv" }),
    net({ brand: "lg", confidence: "likely", hostname: "Bedroom LG", online: false }),
    net({ brand: "roku", confidence: "certain", model: "Ultra" }),
    net({ brand: "xbox", confidence: "likely", hostname: "Xbox" }),
    net({ brand: "samsung", confidence: "guess", vendor: "Samsung" }),
    net({ hostname: "router", vendor: "Netgear", kind: "network" }),
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => net({ hostname: `Ring-Cam-${n}`, kind: "camera" })),
    ...[1, 2, 3].map((n) => net({ hostname: `echo-${n}`, vendor: "Espressif Inc." })),
    net({ hostname: "Seans-MacBook", vendor: "Apple" }),
    net({ vendor: "Polycom", hostname: "voip-desk" }),
    net({ hostname: "HP-LaserJet" }),
    net({}),
  ];
}

describe("buildSections", () => {
  const sections = buildSections(householdScan(), [], {});

  test("recognized online devices are Ready to add, most confident first", () => {
    expect(sections.ready.map((row) => row.brand?.id)).toEqual(["lg", "roku", "xbox", "samsung"]);
  });

  test("a recognized device that is off is listed separately", () => {
    expect(sections.offline).toHaveLength(1);
    expect(sections.offline[0].online).toBe(false);
  });

  test("everything else is counted as other and grouped by kind, empty groups omitted", () => {
    expect(sections.otherCount).toBe(sections.otherGroups.reduce((sum, group) => sum + group.rows.length, 0));
    expect(sections.otherGroups.map((group) => group.id)).toEqual(["media", "cameras", "phones-computers", "network", "other"]);
    expect(sections.otherGroups.find((group) => group.id === "cameras")?.rows).toHaveLength(7);
  });

  test("the client-side guess groups a Pi that sends no kind", () => {
    const media = sections.otherGroups.find((group) => group.id === "media");
    expect(media?.rows).toHaveLength(3);
    const phonesAndComputers = sections.otherGroups.find((group) => group.id === "phones-computers");
    expect(phonesAndComputers?.rows.map((row) => row.kind).sort()).toEqual(["computer", "phone"]);
  });

  test("the printer and the featureless device end up in Other, likely candidates first", () => {
    const other = sections.otherGroups.find((group) => group.id === "other");
    expect(other?.rows.map((row) => row.kind)).toEqual(["unknown", "printer"]);
  });

  test("devices already added are counted but not listed", () => {
    const devices = [net({ ip: "10.0.0.1", brand: "roku", confidence: "certain" }), net({ brand: "lg", confidence: "certain" })];
    const result = buildSections(devices, [saved("10.0.0.1")], {});
    expect(result.addedCount).toBe(1);
    expect(result.ready).toHaveLength(1);
    expect(result.addableCount).toBe(1);
  });

  test("hidden devices, from the household flag or this phone, leave the lists and land under Hidden", () => {
    const devices = [net({ hidden: true, hostname: "cam" }), net({ mac: "aa:bb", hostname: "printer" }), net({ brand: "roku", confidence: "certain" })];
    const result = buildSections(devices, [], { "aa:bb": { hidden: true } });
    expect(result.hidden).toHaveLength(2);
    expect(result.otherCount).toBe(0);
    expect(result.addableCount).toBe(1);
  });

  test("search filters by name, address, vendor and brand, and does not change what counts toward showing search", () => {
    const filtered = buildSections(householdScan(), [], {}, "netgear");
    expect(filtered.otherCount).toBe(1);
    expect(filtered.ready).toHaveLength(0);
    expect(filtered.listedBeforeFilter).toBe(sections.listedBeforeFilter);
    expect(buildSections(householdScan(), [], {}, "roku").ready).toHaveLength(1);
  });
});

describe("matchesQuery", () => {
  const row = toDiscoveryRow(net({ ip: "192.168.7.21", hostname: "Den-Speaker", vendor: "Sonos" }), []);

  test("matches case-insensitively across title, ip and vendor; blank matches everything", () => {
    expect(matchesQuery(row, "den")).toBe(true);
    expect(matchesQuery(row, "192.168.7")).toBe(true);
    expect(matchesQuery(row, "SONOS")).toBe(true);
    expect(matchesQuery(row, "  ")).toBe(true);
    expect(matchesQuery(row, "roku")).toBe(false);
  });
});

describe("shouldShowSearch", () => {
  test("shows only when more than 8 devices are listed", () => {
    expect(shouldShowSearch(buildSections(householdScan(), [], {}))).toBe(true);
    expect(shouldShowSearch(buildSections(householdScan().slice(0, 8), [], {}))).toBe(false);
    expect(shouldShowSearch(buildSections(householdScan().slice(0, 9), [], {}))).toBe(true);
  });
});

describe("buildListItems", () => {
  const sections = buildSections(householdScan(), [], {});
  const collapsed = { otherExpanded: false, hiddenExpanded: false, searching: false };
  const kinds = (items: ListItem[]) => items.map((item) => item.type);

  test("collapsed: ready and offline sections with counts, then a single toggle row for the noise", () => {
    const items = buildListItems(sections, collapsed);
    expect(items.filter((item) => item.type === "row")).toHaveLength(5);
    const headers = items.filter((item): item is Extract<ListItem, { type: "header" }> => item.type === "header");
    expect(headers.map((item) => [item.title, item.count])).toEqual([["Ready to add", 4], ["Recognized, offline", 1]]);
    const toggle = items.find((item) => item.type === "toggle");
    expect(toggle).toMatchObject({ target: "other", expanded: false, label: `${sections.otherCount} other devices — show` });
  });

  test("expanded: kind subheaders with counts, rows, then a hide toggle", () => {
    const items = buildListItems(sections, { ...collapsed, otherExpanded: true });
    expect(kinds(items)).toContain("subheader");
    expect(items.filter((item) => item.type === "row")).toHaveLength(5 + sections.otherCount);
    expect(items[items.length - 1]).toMatchObject({ type: "toggle", expanded: true });
  });

  test("a single other device is singular", () => {
    const one = buildSections([net({ hostname: "printer" })], [], {});
    expect(buildListItems(one, collapsed)[0]).toMatchObject({ label: "1 other device — show" });
  });

  test("the Hidden row appears at the bottom with its count, and expands to its rows", () => {
    const withHidden = buildSections([net({ hidden: true, hostname: "cam" }), net({ brand: "roku", confidence: "certain" })], [], {});
    const items = buildListItems(withHidden, collapsed);
    expect(items[items.length - 1]).toMatchObject({ type: "toggle", target: "hidden", label: "Hidden (1)" });
    expect(buildListItems(withHidden, { ...collapsed, hiddenExpanded: true }).filter((item) => item.type === "row")).toHaveLength(2);
  });

  test("searching opens the other list on its own, and a search with no results says so", () => {
    const searched = buildSections(householdScan(), [], {}, "ring");
    expect(buildListItems(searched, { ...collapsed, searching: true }).filter((item) => item.type === "row")).toHaveLength(7);
    const none = buildSections(householdScan(), [], {}, "zzz");
    expect(kinds(buildListItems(none, { ...collapsed, searching: true }))).toEqual(["no-match"]);
  });
});

describe("pickScreenState", () => {
  const empty = buildSections([], [], {});
  const base = { status: "done" as const, deviceCount: 0, sections: empty, failure: null, fccConfigured: true };

  test("scanning with nothing yet shows the scanning state, but a rescan keeps the list", () => {
    expect(pickScreenState({ ...base, status: "scanning" })).toBe("scanning");
    expect(pickScreenState({ ...base, status: "scanning", deviceCount: 3, sections: buildSections(householdScan(), [], {}) })).toBe("list");
  });

  test("devices present but all added is the all-added state", () => {
    const all = buildSections([net({ ip: "10.0.0.1" })], [saved("10.0.0.1")], {});
    expect(pickScreenState({ ...base, deviceCount: 1, sections: all })).toBe("all-added");
  });

  test("no devices: unreachable beats not-configured beats none-found", () => {
    expect(pickScreenState({ ...base, failure })).toBe("unreachable");
    expect(pickScreenState({ ...base, fccConfigured: false })).toBe("not-configured");
    expect(pickScreenState({ ...base, failure: { ...failure, kind: "not-configured" }, fccConfigured: false })).toBe("not-configured");
    expect(pickScreenState(base)).toBe("none-found");
  });

  test("a list is shown even when only hidden devices remain", () => {
    const onlyHidden = buildSections([net({ hidden: true })], [], {});
    expect(pickScreenState({ ...base, deviceCount: 1, sections: onlyHidden })).toBe("list");
  });
});

describe("formatScannedAgo", () => {
  const now = 1_000_000;

  test("words seconds, minutes and just now; blank before the first scan", () => {
    expect(formatScannedAgo(null, now)).toBe("");
    expect(formatScannedAgo(now - 500, now)).toBe("Scanned just now");
    expect(formatScannedAgo(now - 3000, now)).toBe("Scanned 3 seconds ago");
    expect(formatScannedAgo(now - 60_000, now)).toBe("Scanned 1 minute ago");
    expect(formatScannedAgo(now - 5 * 60_000, now)).toBe("Scanned 5 minutes ago");
    expect(formatScannedAgo(now - 2 * 3_600_000, now)).toBe("Scanned over an hour ago");
  });
});

describe("pickSuggested", () => {
  test("shows at most 3 ready devices and counts everything else addable", () => {
    const pick = pickSuggested(buildSections(householdScan(), [], {}));
    expect(pick.top).toHaveLength(3);
    expect(pick.remaining).toBe(buildSections(householdScan(), [], {}).addableCount - 3);
  });

  test("with fewer than 3 ready devices it shows them all and no more than exist", () => {
    const pick = pickSuggested(buildSections([net({ brand: "roku", confidence: "certain" })], [], {}));
    expect(pick).toEqual({ top: expect.any(Array), remaining: 0 });
    expect(pick.top).toHaveLength(1);
  });
});
