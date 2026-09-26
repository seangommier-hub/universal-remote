import { sendWakeOnLan } from "./wakeOnLan";
import { requestWithRelayFallback, resetRelayNecessityCacheForTests } from "./httpRelayFallback";
import { openSocketWithRelayFallback, resetDirectFailureMemoryForTests } from "./wsRelayFallback";
import { getConnectivityMode } from "./fccConnectivity";
import { getSysInfo } from "../../drivers/outlet/kasa/KasaClient";
import { AppleTvClient } from "../../drivers/tv/appletv/AppleTvClient";
import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";
import { flushMicrotasks, installMockWebSocket, MockWebSocket } from "../../testUtils/mockWebSocket";

jest.mock("../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

const LAN = "http://192.168.1.172:3210";
const PUBLIC = "https://hearth-relay.example.app";
const AWAY_CONFIG = { baseUrl: LAN, token: "secret-token", publicBaseUrl: PUBLIC };

function ok(body: unknown = {}): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

function reject(status: number): Response {
  return { ok: false, status, json: async () => ({}), text: async () => "" } as Response;
}

function urlsCalled(): string[] {
  return (global.fetch as jest.Mock).mock.calls.map((call) => call[0] as string);
}

beforeEach(() => {
  resetRelayNecessityCacheForTests();
  resetDirectFailureMemoryForTests();
  global.fetch = jest.fn();
  (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(AWAY_CONFIG);
});

describe("away from home: LAN unreachable, public tunnel works", () => {
  const lanDown = () => (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"));

  test("wake-on-LAN reaches the public tunnel", async () => {
    lanDown().mockResolvedValueOnce(ok({ sent: true }));
    await sendWakeOnLan("F8:B9:5A:43:7E:3E");
    expect(urlsCalled()).toEqual([`${LAN}/api/integrations/hearth/wake-on-lan`, `${PUBLIC}/api/integrations/hearth/wake-on-lan`]);
  });

  test("a Kasa plug proxy call reaches the public tunnel", async () => {
    lanDown().mockResolvedValueOnce(ok({ relayState: true, alias: "Lamp", model: "HS103" }));
    await expect(getSysInfo("192.168.1.50")).resolves.toMatchObject({ relayState: true });
    expect(urlsCalled()[1]).toBe(`${PUBLIC}/api/integrations/hearth/kasa/sysinfo?ip=192.168.1.50`);
  });

  test("an Apple TV pairing call reaches the public tunnel", async () => {
    lanDown().mockResolvedValueOnce(ok({ sessionId: "s1" }));
    await expect(new AppleTvClient().startPairing("192.168.1.60")).resolves.toEqual({ sessionId: "s1" });
    expect(urlsCalled()[1]).toContain(PUBLIC);
  });

  test("the HTTP relay skips the doomed direct attempt once away and goes straight to the public tunnel", async () => {
    lanDown().mockResolvedValueOnce(ok());
    await sendWakeOnLan("F8:B9:5A:43:7E:3E");
    expect(getConnectivityMode()).toBe("away");
    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok({ status: 200, headers: {}, body: "{}" }));

    await requestWithRelayFallback({ ip: "192.168.1.50", port: 8060, path: "/query/device-info", method: "GET" });

    expect(urlsCalled()).toEqual([`${PUBLIC}/api/integrations/hearth/relay/http`]);
  });

  test("a 401 on wake-on-LAN is a token error and never retried on the public tunnel", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(reject(401));
    await expect(sendWakeOnLan("F8:B9:5A:43:7E:3E")).rejects.toThrow(/rejected the saved token/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("a 401 on a Kasa call is not retried on the public tunnel", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(reject(401));
    await expect(getSysInfo("192.168.1.50")).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("away from home: the WebSocket relay", () => {
  beforeEach(() => installMockWebSocket());

  test("skips the direct attempt and the LAN relay, connecting straight to the public relay", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("down")).mockResolvedValueOnce(ok());
    await sendWakeOnLan("F8:B9:5A:43:7E:3E");
    expect(getConnectivityMode()).toBe("away");

    const opening = openSocketWithRelayFallback("wss://192.168.1.70:3001");
    await flushMicrotasks();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.at(0).url).toBe("wss://hearth-ws.example.app/?token=secret-token&target=wss%3A%2F%2F192.168.1.70%3A3001");
    MockWebSocket.at(0).simulateOpen();
    await opening;
  });
});
