import { classifyNetworkFailure } from "../core/network/classifyNetworkFailure";
import { adviceForEmptyScan } from "./discoverEmptyAdvice";
import { interpretScannedQr } from "./scannedQr";
import { FOREGROUND_RESCAN_MIN_INTERVAL_MS, SLOW_SCAN_MS, scanningText, shouldRescanOnForeground } from "./scanProgress";
import { buildPairLink } from "./pairInvite";

describe("adviceForEmptyScan", () => {
  test("test_nothing_found_lists_permission_and_wifi_causes_with_a_settings_button", () => {
    const advice = adviceForEmptyScan("none-found", null);
    expect(advice.reasons.join(" ")).toMatch(/Local Network/);
    expect(advice.reasons.join(" ")).toMatch(/different Wi-Fi/);
    expect(advice.actions).toContain("open-phone-settings");
  });

  test("test_unreachable_leads_with_open_settings", () => {
    const failure = classifyNetworkFailure(new Error("Network request failed"));
    expect(adviceForEmptyScan("unreachable", failure).actions[0]).toBe("open-phone-settings");
  });

  test("test_rejected_token_leads_with_family_command_center_setup_not_settings", () => {
    const failure = classifyNetworkFailure(new Error("Family Command Center rejected the saved token."));
    const advice = adviceForEmptyScan("unreachable", failure);
    expect(failure.kind).toBe("rejected-token");
    expect(advice.actions[0]).toBe("setup-fcc");
    expect(advice.reasons).toEqual([]);
  });

  test("test_not_configured_and_all_added_have_one_clear_action", () => {
    expect(adviceForEmptyScan("not-configured", null).actions).toEqual(["setup-fcc"]);
    expect(adviceForEmptyScan("all-added", null).actions).toEqual(["scan-again"]);
  });
});

describe("interpretScannedQr", () => {
  test("test_settings_json_is_recognized", () => {
    expect(interpretScannedQr(JSON.stringify({ baseUrl: "http://pi.local:3000", token: "t" }))).toEqual({ kind: "settings", baseUrl: "http://pi.local:3000", token: "t" });
  });

  test("test_pair_link_is_recognized_as_an_invite", () => {
    const link = buildPairLink("ABCD2345", "https://home.example.com");
    expect(interpretScannedQr(` ${link} `)).toEqual({ kind: "invite", invite: { code: "ABCD2345", server: "https://home.example.com" } });
  });

  test("test_incomplete_link_and_random_text_are_rejected", () => {
    expect(interpretScannedQr("hearth://pair?code=ABC")).toBeNull();
    expect(interpretScannedQr("https://example.com")).toBeNull();
    expect(interpretScannedQr('{"baseUrl": 3}')).toBeNull();
  });
});

describe("scan progress", () => {
  test("test_scanning_text_shows_the_live_count_when_devices_are_known", () => {
    expect(scanningText({ foundCount: 7, elapsedMs: 100 })).toBe("Scanning... 7 found so far");
  });

  test("test_slow_first_scan_gets_a_patience_note", () => {
    expect(scanningText({ foundCount: 0, elapsedMs: 100 })).toBe("Scanning...");
    expect(scanningText({ foundCount: 0, elapsedMs: SLOW_SCAN_MS })).toMatch(/Still looking/);
  });

  test("test_foreground_rescan_waits_out_the_minimum_interval_and_never_overlaps", () => {
    const now = 1_000_000;
    expect(shouldRescanOnForeground({ scanning: true, scannedAt: null, now })).toBe(false);
    expect(shouldRescanOnForeground({ scanning: false, scannedAt: null, now })).toBe(true);
    expect(shouldRescanOnForeground({ scanning: false, scannedAt: now - 1000, now })).toBe(false);
    expect(shouldRescanOnForeground({ scanning: false, scannedAt: now - FOREGROUND_RESCAN_MIN_INTERVAL_MS, now })).toBe(true);
  });
});
