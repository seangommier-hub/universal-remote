import { checkFccReachableNow, probeFccHealth } from "./familyCommandCenterHealth";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { resetConnectivityForTests } from "../core/network/fccConnectivity";

// Same explicit-factory reasoning as wsRelayFallback.test.ts: automocking still requires the real
// module once, which imports AsyncStorage/SecureStore -- native modules that don't exist here.
jest.mock("./familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

const CONFIG = { baseUrl: "http://192.168.1.172:3210", token: "secret-token" };

function ok(status = 200): Response {
  return { ok: status < 400, status, json: async () => ({}) } as Response;
}

describe("checkFccReachableNow", () => {
  beforeEach(() => {
    resetConnectivityForTests();
    global.fetch = jest.fn();
  });

  test("true when Family Command Center answers", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok());
    await expect(checkFccReachableNow()).resolves.toBe(true);
  });

  test("false when Family Command Center is unreachable", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(CONFIG);
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
    await expect(checkFccReachableNow()).resolves.toBe(false);
  });

  test("false (not thrown) when Family Command Center isn't configured at all", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    await expect(checkFccReachableNow()).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // A manual "check now" shouldn't have to wait out the debounced outage grace period a single
  // background probe failure wouldn't yet count as an outage for -- it reports THIS attempt directly.
  test("reports a single failure immediately, unlike the debounced outage signal", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(CONFIG);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"));
    const reached = await checkFccReachableNow();
    expect(reached).toBe(false);
  });
});

describe("probeFccHealth", () => {
  beforeEach(() => {
    resetConnectivityForTests();
    global.fetch = jest.fn();
  });

  test("never throws and never returns a value, even on failure", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(CONFIG);
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
    await expect(probeFccHealth()).resolves.toBeUndefined();
  });
});
