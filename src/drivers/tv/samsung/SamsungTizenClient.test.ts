import { SamsungPairingError, SamsungTizenClient } from "./SamsungTizenClient";
import { flushMicrotasks, installMockWebSocket, MockWebSocket } from "../../../testUtils/mockWebSocket";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

describe("SamsungTizenClient", () => {
  beforeEach(() => {
    installMockWebSocket();
    mockLoadConfig.mockReset();
  });

  test("connects to the unencrypted port 8001 endpoint with a base64-encoded app name", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60", appName: "Hearth" });
    const connectPromise = client.connect();

    const socket = MockWebSocket.latest();
    expect(socket.url).toBe("ws://192.168.1.60:8001/api/v2/channels/samsung.remote.control?name=SGVhcnRo");

    socket.simulateOpen();
    await flushMicrotasks();
    socket.simulateMessage({ event: "ms.channel.connect", data: {} });
    await expect(connectPromise).resolves.toBeUndefined();
  });

  test("resolves with the token the TV issues on a first-ever pairing", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60", appName: "Hearth" });
    const connectPromise = client.connect();

    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();
    socket.simulateMessage({ event: "ms.channel.connect", data: { token: "12345678" } });

    await expect(connectPromise).resolves.toBe("12345678");
  });

  test("sends a previously-known token back as a query param, skipping the on-screen prompt", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60", appName: "Hearth", token: "known-token" });
    const connectPromise = client.connect();

    const socket = MockWebSocket.latest();
    expect(socket.url).toBe("ws://192.168.1.60:8001/api/v2/channels/samsung.remote.control?name=SGVhcnRo&token=known-token");

    socket.simulateOpen();
    await flushMicrotasks();
    socket.simulateMessage({ event: "ms.channel.connect", data: {} });
    await expect(connectPromise).resolves.toBe("known-token"); // TV didn't repeat it back, but it's still the valid known one
  });

  test("rejects with SamsungPairingError when the TV denies pairing", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60" });
    const connectPromise = client.connect();

    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();
    socket.simulateMessage({ event: "ms.channel.unauthorized" });

    await expect(connectPromise).rejects.toBeInstanceOf(SamsungPairingError);
  });

  test("falls back to the Family Command Center relay when the direct connection fails", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "relay-token" });

    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60", appName: "Hearth" });
    const connectPromise = client.connect();

    const directSocket = MockWebSocket.latest();
    expect(directSocket.url).toBe("ws://192.168.1.60:8001/api/v2/channels/samsung.remote.control?name=SGVhcnRo");
    directSocket.simulateError();
    await flushMicrotasks();

    const relaySocket = MockWebSocket.latest();
    expect(relaySocket).not.toBe(directSocket);
    expect(relaySocket.url).toBe(
      "ws://192.168.1.172:3211/?token=relay-token&target=ws%3A%2F%2F192.168.1.60%3A8001%2Fapi%2Fv2%2Fchannels%2Fsamsung.remote.control%3Fname%3DSGVhcnRo"
    );

    relaySocket.simulateOpen();
    await flushMicrotasks();
    relaySocket.simulateMessage({ event: "ms.channel.connect", data: {} });
    await expect(connectPromise).resolves.toBeUndefined();
  });

  test("rejects on a socket error", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60" });
    const connectPromise = client.connect();

    // Fails at the transport layer before ever opening — no relay configured either, so the
    // fallback attempt (see httpRelayFallback/wsRelayFallback pattern) also fails, surfacing a
    // clear error rather than hanging.
    MockWebSocket.latest().simulateError();

    await expect(connectPromise).rejects.toThrow();
  });

  test("sendKey sends the documented ms.remote.control envelope once connected", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60" });
    const connectPromise = client.connect();
    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();
    socket.simulateMessage({ event: "ms.channel.connect", data: {} });
    await connectPromise;

    client.sendKey("KEY_POWER");

    const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    expect(sent).toEqual({
      method: "ms.remote.control",
      params: { Cmd: "Click", DataOfCmd: "KEY_POWER", Option: "false", TypeOfRemote: "SendRemoteKey" },
    });
  });

  test("sendKey throws if called before a successful connect", () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60" });
    expect(() => client.sendKey("KEY_POWER")).toThrow(/not connected/);
  });
});
