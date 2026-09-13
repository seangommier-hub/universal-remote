import { requestWithRelayFallback } from "./httpRelayFallback";
import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";

// Same explicit-factory reasoning as FamilyCommandCenterDiscoveryProvider.test.ts: automocking
// still requires the real module once, which imports AsyncStorage/SecureStore -- native modules
// that don't exist in this Jest environment.
jest.mock("../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe("requestWithRelayFallback", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "secret-token" });
  });

  test("uses the direct response when the device answers directly, without ever calling the relay", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await requestWithRelayFallback({ ip: "192.168.1.50", port: 8060, path: "/query/device-info", method: "GET" });

    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("http://192.168.1.50:8060/query/device-info", expect.objectContaining({ method: "GET" }));
  });

  test("falls back to the relay when the direct request fails, and the relay response is used", async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce(jsonResponse({ status: 200, headers: {}, body: '{"ok":true}' }));

    const result = await requestWithRelayFallback({ ip: "10.20.30.40", port: 8060, path: "/query/device-info", method: "GET" });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://192.168.1.172:3210/api/integrations/hearth/relay/http",
      expect.objectContaining({ method: "POST" })
    );
  });

  test(
    "the relay leg times out and surfaces a clear, retry-able error instead of hanging forever (real-hardware-pattern finding, 2026-09-12)",
    async () => {
      // Real timers deliberately, not fake ones -- this project's established tradeoff
      // (FamilyCommandCenterDiscoveryProvider's own timeout test, LgWebOsDriver's setChannel
      // test) since AbortController's event dispatch interacting with fake-timer microtask
      // ordering has proven flaky here before.
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("Network request failed")) // direct leg fails fast
        .mockImplementationOnce(
          (_url: string, init: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener("abort", () => {
                const err = new Error("The operation was aborted");
                err.name = "AbortError";
                reject(err);
              });
            })
        );

      await expect(requestWithRelayFallback({ ip: "10.20.30.40", port: 8060, path: "/query/device-info", method: "GET" })).rejects.toThrow(
        /didn't respond within/
      );
    },
    12000
  );

  test("throws a clear error when the direct request fails and Family Command Center isn't configured for relay", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));

    await expect(requestWithRelayFallback({ ip: "10.20.30.40", port: 8060, path: "/query/device-info", method: "GET" })).rejects.toThrow(
      /isn't configured for relay fallback/
    );
  });
});
