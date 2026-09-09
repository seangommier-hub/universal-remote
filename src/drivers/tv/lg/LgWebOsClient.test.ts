import { LgWebOsClient } from "./LgWebOsClient";
import { flushMicrotasks, installMockWebSocket, MockWebSocket } from "../../../testUtils/mockWebSocket";

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
  });

  test("connects to the unencrypted port 3000 root path and sends the register handshake on open", async () => {
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70" });
    const connectPromise = client.connect();
    const socket = MockWebSocket.latest();

    expect(socket.url).toBe("ws://192.168.1.70:3000");
    expect(socket.sentMessages).toHaveLength(0);

    socket.simulateOpen();
    await flushMicrotasks();
    const sent = JSON.parse(socket.sentMessages[0]);
    expect(sent.type).toBe("register");
    expect(sent.payload.manifest.appVersion).toBe("1.1");

    socket.simulateMessage({ type: "registered", id: sent.id, payload: { "client-key": "abc" } });
    await expect(connectPromise).resolves.toBeUndefined();
  });

  test("waits through an intermediate prompt response before resolving", async () => {
    const client = new LgWebOsClient({ ipAddress: "192.168.1.70" });
    await connectClient(client);
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
    mainSocket.simulateMessage({ type: "response", id: getSocketRequest.id, payload: { returnValue: true, socketPath: "ws://192.168.1.70:3000/pointer" } });
    await Promise.resolve(); // let getPointerSocket()'s continuation construct the new WebSocket

    const pointerSocket = MockWebSocket.at(1);
    expect(pointerSocket.url).toBe("ws://192.168.1.70:3000/pointer");
    pointerSocket.simulateOpen();
    await buttonPromise;

    expect(pointerSocket.sentMessages[0]).toBe("type:button\nname:HOME\n\n");
  });
});
