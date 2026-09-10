import { LgWebOsClient } from "./LgWebOsClient";
import { flushMicrotasks, installMockWebSocket, MockWebSocket } from "../../../testUtils/mockWebSocket";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

async function connectClient(client: LgWebOsClient): Promise<void> {
  const connectPromise = client.connect();
  const socket = MockWebSocket.latest();
  socket.simulateOpen();
  // openSocketWithRelayFallback's own internal await chain means connect() doesn't resume (and
  // attach onmessage) synchronously with the open event anymore — flush before sending messages.
  await flushMicrotasks();
  // The TV first replies with a "prompt is showing" response (no client-key yet)...
  socket.simulateMessage({ type: "response", id: "1", payload: { pairingType: "PROMPT", returnValue: true } });
  // ...then, once the user accepts on-screen, the final response carrying the client-key.
  socket.simulateMessage({ type: "registered", id: "1", payload: { "client-key": "test-key" } });
  await connectPromise;
}

describe("LgWebOsClient", () => {
  beforeEach(() => {
    installMockWebSocket();
    mockLoadConfig.mockReset();
  });

  test("falls back to the Family Command Center relay when the direct wss connection fails — the expected path on real hardware, since React Native can never trust the TV's self-signed certificate directly (ADR-HEARTH-014)", async () => {
    mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "relay-token" });

    const client = new LgWebOsClient({ ipAddress: "10.20.30.40" });
    const connectPromise = client.connect();

    const directSocket = MockWebSocket.latest();
    expect(directSocket.url).toBe("wss://10.20.30.40:3001");
    directSocket.simulateError();
    await flushMicrotasks();

    const relaySocket = MockWebSocket.latest();
    expect(relaySocket).not.toBe(directSocket);
    expect(relaySocket.url).toBe(
      "ws://192.168.1.172:3211/?token=relay-token&target=wss%3A%2F%2F10.20.30.40%3A3001"
    );

    relaySocket.simulateOpen();
    await flushMicrotasks();
    const sent = JSON.parse(relaySocket.sentMessages[0]);
    expect(sent.type).toBe("register");

    relaySocket.simulateMessage({ type: "registered", id: sent.id, payload: { "client-key": "relayed-key" } });
    await expect(connectPromise).resolves.toBe("relayed-key");
  });

  test("connects to the encrypted port 3001 root path and sends the register handshake on open", async () => {
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70" });
    const connectPromise = client.connect();
    const socket = MockWebSocket.latest();

    expect(socket.url).toBe("wss://192.168.1.70:3001");
    expect(socket.sentMessages).toHaveLength(0);

    socket.simulateOpen();
    await flushMicrotasks();
    const sent = JSON.parse(socket.sentMessages[0]);
    expect(sent.type).toBe("register");
    expect(sent.payload.manifest.appVersion).toBe("1.1");

    socket.simulateMessage({ type: "registered", id: sent.id, payload: { "client-key": "abc" } });
    await expect(connectPromise).resolves.toBe("abc");
  });

  test("waits through an intermediate prompt response before resolving", async () => {
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70" });
    await connectClient(client);
  });

  test("sends a previously-known client-key back on the next connect, so the TV can skip the Allow/Deny prompt (real-hardware ask, 2026-09-10)", async () => {
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70", clientKey: "already-approved-key" });
    const connectPromise = client.connect();
    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();

    const sent = JSON.parse(socket.sentMessages[0]);
    expect(sent.payload["client-key"]).toBe("already-approved-key");
    // The manifest itself is still sent in full alongside the key, not replaced by it — the TV
    // needs both to recognize a returning, already-approved client.
    expect(sent.payload.manifest.appVersion).toBe("1.1");

    socket.simulateMessage({ type: "registered", id: sent.id, payload: { "client-key": "already-approved-key" } });
    await expect(connectPromise).resolves.toBe("already-approved-key");
  });

  test("rejects on an explicit error response", async () => {
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70" });
    const connectPromise = client.connect();
    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();
    const sent = JSON.parse(socket.sentMessages[0]);

    socket.simulateMessage({ type: "error", id: sent.id, error: "403 cancelled" });

    await expect(connectPromise).rejects.toThrow("403 cancelled");
  });

  test("call() sends a request envelope and resolves with the response payload", async () => {
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70" });
    await connectClient(client);

    const callPromise = client.call("ssap://audio/getVolume");
    const socket = MockWebSocket.latest();
    const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);
    expect(sent).toMatchObject({ type: "request", uri: "ssap://audio/getVolume", payload: {} });

    socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: true, volume: 12, mute: false } });
    await expect(callPromise).resolves.toEqual({ returnValue: true, volume: 12, mute: false });
  });

  test("call() rejects when the TV reports returnValue: false", async () => {
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70" });
    await connectClient(client);

    const callPromise = client.call("ssap://tv/channelUp");
    const socket = MockWebSocket.latest();
    const sent = JSON.parse(socket.sentMessages[socket.sentMessages.length - 1]);

    socket.simulateMessage({ type: "response", id: sent.id, payload: { returnValue: false, errorText: "no tuner" } });
    await expect(callPromise).rejects.toThrow("no tuner");
  });

  test("sendButton opens a separate pointer-input socket and writes the key:value wire format", async () => {
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70" });
    await connectClient(client);

    const buttonPromise = client.sendButton("HOME");

    // getPointerInputSocket request goes out on the main socket first.
    const mainSocket = MockWebSocket.at(0);
    const getSocketRequest = JSON.parse(mainSocket.sentMessages[mainSocket.sentMessages.length - 1]);
    expect(getSocketRequest.uri).toBe("ssap://com.webos.service.networkinput/getPointerInputSocket");
    mainSocket.simulateMessage({ type: "response", id: getSocketRequest.id, payload: { returnValue: true, socketPath: "wss://192.168.1.70:3001/pointer" } });
    await Promise.resolve(); // let getPointerSocket()'s continuation construct the new WebSocket

    const pointerSocket = MockWebSocket.at(1);
    expect(pointerSocket.url).toBe("wss://192.168.1.70:3001/pointer");
    pointerSocket.simulateOpen();
    await buttonPromise;

    expect(pointerSocket.sentMessages[0]).toBe("type:button\nname:HOME\n\n");
  });

  test("two rapid sendButton calls share one pointer socket instead of opening a second (real-hardware finding, 2026-09-09)", async () => {
    // Same class of race the driver-level fix addressed, one layer down: fast repeated d-pad
    // taps before the first getPointerInputSocket round trip completes must not each open their
    // own pointer socket against a TV confirmed (live) to hang rather than reject a second one.
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70" });
    await connectClient(client);
    const mainSocket = MockWebSocket.at(0);

    const firstButton = client.sendButton("UP");
    const secondButton = client.sendButton("DOWN"); // fired before the first has any chance to resolve

    const socketRequests = mainSocket.sentMessages
      .map((raw) => JSON.parse(raw))
      .filter((m) => m.uri === "ssap://com.webos.service.networkinput/getPointerInputSocket");
    expect(socketRequests).toHaveLength(1); // not 2 — the second call didn't request its own socket path

    mainSocket.simulateMessage({ type: "response", id: socketRequests[0].id, payload: { returnValue: true, socketPath: "wss://192.168.1.70:3001/pointer" } });
    await flushMicrotasks();

    expect(MockWebSocket.instances).toHaveLength(2); // main socket + exactly one pointer socket
    const pointerSocket = MockWebSocket.at(1);
    pointerSocket.simulateOpen();

    await Promise.all([firstButton, secondButton]);
    expect(pointerSocket.sentMessages).toEqual(["type:button\nname:UP\n\n", "type:button\nname:DOWN\n\n"]);
    expect(MockWebSocket.instances).toHaveLength(2);
  });
});
