import { openSocketWithRelayFallback } from "./wsRelayFallback";
import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";
import { flushMicrotasks, installMockWebSocket, MockWebSocket } from "../../testUtils/mockWebSocket";

// Same explicit-factory reasoning as httpRelayFallback.test.ts: automocking still requires the
// real module once, which imports AsyncStorage/SecureStore -- native modules that don't exist in
// this Jest environment.
jest.mock("../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

describe("openSocketWithRelayFallback", () => {
  beforeEach(() => {
    installMockWebSocket();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "secret-token" });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("connects directly when the device answers, without ever touching Family Command Center", async () => {
    const openPromise = openSocketWithRelayFallback("wss://192.168.1.70:3001");
    MockWebSocket.latest().simulateOpen();

    const socket = await openPromise;
    expect(socket.url).toBe("wss://192.168.1.70:3001");
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  test("falls back to the LAN relay when the direct connection errors", async () => {
    const openPromise = openSocketWithRelayFallback("wss://10.20.30.40:3001");
    MockWebSocket.at(0).simulateError();
    await flushMicrotasks();

    const relaySocket = MockWebSocket.at(1);
    expect(relaySocket.url).toBe("ws://192.168.1.172:3211/?token=secret-token&target=wss%3A%2F%2F10.20.30.40%3A3001");
    relaySocket.simulateOpen();

    const socket = await openPromise;
    expect(socket).toBe(relaySocket);
  });

  // ADR-HEARTH-137: Hearth felt laggy next to a real remote partly because every new connection to a
  // device that can only be reached through the relay first waited out a doomed direct attempt.
  test("once the relay has worked for a device, the next connection skips the doomed direct attempt", async () => {
    const first = openSocketWithRelayFallback("wss://10.20.30.40:3001");
    MockWebSocket.at(0).simulateError();
    await flushMicrotasks();
    MockWebSocket.at(1).simulateOpen();
    await first;

    const second = openSocketWithRelayFallback("wss://10.20.30.40:3001");
    await flushMicrotasks();
    const next = MockWebSocket.at(2);
    expect(next.url).toContain(":3211/"); // straight to the relay, no direct wss:// attempt in between
    next.simulateOpen();
    await second;
  });

  // Real ask (2026-09-21, ADR-HEARTH-123): "this should be something that can still be used even
  // when off network." Away from the home WiFi, both direct and the LAN relay fail outright.
  describe("public URL fallback (away from home)", () => {
    beforeEach(() => {
      (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({
        baseUrl: "http://192.168.1.172:3210",
        token: "secret-token",
        publicBaseUrl: "https://hearth-relay.carddna.app",
      });
    });

    test("falls back to the public tunnel's WS hostname (wss://, hearth-relay. swapped for hearth-ws., no explicit port) when both direct and the LAN relay fail", async () => {
      const openPromise = openSocketWithRelayFallback("wss://192.168.1.70:3001");
      MockWebSocket.at(0).simulateError(); // direct
      await flushMicrotasks();
      MockWebSocket.at(1).simulateError(); // LAN relay
      await flushMicrotasks();

      const publicSocket = MockWebSocket.at(2);
      expect(publicSocket.url).toBe("wss://hearth-ws.carddna.app/?token=secret-token&target=wss%3A%2F%2F192.168.1.70%3A3001");
      publicSocket.simulateOpen();

      const socket = await openPromise;
      expect(socket).toBe(publicSocket);
    });

    test("no publicBaseUrl configured -- a failed LAN relay surfaces its own error normally, exactly as before this feature existed", async () => {
      (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "secret-token" });
      const openPromise = openSocketWithRelayFallback("wss://192.168.1.70:3001");
      MockWebSocket.at(0).simulateError();
      await flushMicrotasks();
      MockWebSocket.at(1).simulateError();

      await expect(openPromise).rejects.toThrow(/Could not open a WebSocket while relaying/);
      expect(MockWebSocket.instances).toHaveLength(2); // never attempted a third (public) socket
    });

    test("a LAN relay that times out (never opens, never errors) still falls through to the public tunnel", async () => {
      jest.useFakeTimers();
      const openPromise = openSocketWithRelayFallback("wss://192.168.1.70:3001");
      MockWebSocket.at(0).simulateError(); // direct fails fast
      await flushMicrotasks(); // let the catch handler's await loadFamilyCommandCenterConfig() resolve and open the LAN relay socket

      // LAN relay (index 1) never calls onopen/onerror -- let its own connect timeout fire.
      await jest.advanceTimersByTimeAsync(8000);
      await flushMicrotasks(); // let that timeout's catch handler open the public-fallback socket

      const publicSocket = MockWebSocket.at(2);
      publicSocket.simulateOpen();

      const socket = await openPromise;
      expect(socket).toBe(publicSocket);
    });
  });

  test("throws a clear error when direct fails and Family Command Center isn't configured at all", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    const openPromise = openSocketWithRelayFallback("wss://10.20.30.40:3001");
    MockWebSocket.at(0).simulateError();
    await flushMicrotasks();

    await expect(openPromise).rejects.toThrow(/isn't configured for relay fallback/);
  });
});
