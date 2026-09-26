import { NetworkDevice } from "./discoverAll";
import { toDiscoveryRow } from "./discoveryRows";
import { buildSupportRequest, canRequestSupport, looksLikeLine } from "./unsupportedReport";

function net(overrides: Partial<NetworkDevice>): NetworkDevice {
  return { id: "n", ip: "192.168.1.10", mac: null, hostname: null, vendor: null, brand: null, model: null, confidence: "unknown", evidence: [], online: true, kind: null, friendlyName: null, hidden: false, labelBrand: null, ...overrides };
}

describe("unsupported device report", () => {
  const camera = toDiscoveryRow(net({ kind: "camera", vendor: "Reolink", hostname: "Reolink-Doorbell", mac: "aa:bb:cc:11:22:33", model: "RLC-1", evidence: ["port 554 open", "ssdp: IPCamera"] }), []);

  test("test_looks_like_line_uses_the_kind_with_the_right_article", () => {
    expect(looksLikeLine(camera)).toBe("Looks like a camera. Not supported yet");
    expect(looksLikeLine(toDiscoveryRow(net({ kind: "iot" }), []))).toBe("Looks like a smart device. Not supported yet");
    expect(looksLikeLine(toDiscoveryRow(net({ kind: "unknown" }), []))).toBe("Not recognized yet");
  });

  test("test_only_unrecognized_rows_can_request_support", () => {
    expect(canRequestSupport(camera)).toBe(true);
    expect(canRequestSupport(toDiscoveryRow(net({ brand: "roku" }), []))).toBe(false);
  });

  test("test_report_carries_vendor_model_ports_but_only_a_mac_prefix", () => {
    const report = buildSupportRequest(camera);
    expect(report).toContain("Vendor: Reolink");
    expect(report).toContain("Model: RLC-1");
    expect(report).toContain("MAC prefix: aa:bb:cc");
    expect(report).toContain("port 554 open; ssdp: IPCamera");
    expect(report).not.toContain("11:22:33");
    expect(report).not.toContain("192.168.1.10");
  });

  test("test_report_skips_fields_discovery_did_not_find", () => {
    const report = buildSupportRequest(toDiscoveryRow(net({ kind: "unknown" }), []));
    expect(report).not.toMatch(/Vendor:|Model:|Seen:/);
  });
});
