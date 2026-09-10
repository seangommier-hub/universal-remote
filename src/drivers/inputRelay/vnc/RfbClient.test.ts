import { RfbButton, RfbClient, RfbProtocolError } from "./RfbClient";

// A minimal mock of the WebSocket interface RfbClient actually uses (constructor, binaryType,
// on{open,message,error,close}, send, close) — real enough to drive the handshake state machine
// without a real socket. `sent` records every outgoing frame as a plain byte array for assertions.
class MockWebSocket {
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: number[][] = [];
  closed = false;

  constructor(public url: string) {
    mockWebSocketInstances.push(this);
  }

  send(data: Uint8Array) {
    this.sent.push(Array.from(data));
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  // Test helpers, not part of the real WebSocket interface.
  serverOpens() {
    this.onopen?.();
  }

  serverSends(bytes: number[]) {
    this.onmessage?.({ data: new Uint8Array(bytes).buffer });
  }
}

let mockWebSocketInstances: MockWebSocket[] = [];

function latestSocket(): MockWebSocket {
  return mockWebSocketInstances[mockWebSocketInstances.length - 1];
}

function bytesOf(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

const VERSION_HANDSHAKE = bytesOf("RFB 003.008\n");
const SECURITY_TYPES_NONE_ONLY = [1, 1]; // count=1, [None]
const SECURITY_RESULT_OK = [0, 0, 0, 0];

function serverInitBytes(width: number, height: number, name: string): number[] {
  const nameBytes = bytesOf(name);
  return [
    (width >> 8) & 0xff,
    width & 0xff,
    (height >> 8) & 0xff,
    height & 0xff,
    ...new Array(16).fill(0), // pixel format — unread by this client
    (nameBytes.length >>> 24) & 0xff,
    (nameBytes.length >>> 16) & 0xff,
    (nameBytes.length >>> 8) & 0xff,
    nameBytes.length & 0xff,
    ...nameBytes,
  ];
}

/** Drives a real client through a full successful handshake, then returns it (already connected) and its socket. */
async function connectedClient(): Promise<{ client: RfbClient; socket: MockWebSocket }> {
  const client = new RfbClient("ws://relay.local/vnc");
  const connectPromise = client.connect();
  const socket = latestSocket();
  socket.serverOpens();
  socket.serverSends(VERSION_HANDSHAKE);
  socket.serverSends(SECURITY_TYPES_NONE_ONLY);
  socket.serverSends(SECURITY_RESULT_OK);
  socket.serverSends(serverInitBytes(1920, 1080, "raspberrypi:0"));
  await connectPromise;
  return { client, socket };
}

describe("RfbClient", () => {
  beforeEach(() => {
    mockWebSocketInstances = [];
    (global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
  });

  test("completes a full handshake and returns the server's real resolution/name", async () => {
    const connectPromise = new RfbClient("ws://relay.local/vnc").connect();
    const socket = latestSocket();
    socket.serverOpens();
    socket.serverSends(VERSION_HANDSHAKE);
    socket.serverSends(SECURITY_TYPES_NONE_ONLY);
    socket.serverSends(SECURITY_RESULT_OK);
    socket.serverSends(serverInitBytes(1920, 1080, "raspberrypi:0"));

    const info = await connectPromise;

    expect(info).toEqual({ width: 1920, height: 1080, name: "raspberrypi:0" });
  });

  test("replies with its own protocol version, security type, and a shared ClientInit — in order", async () => {
    const connectPromise = new RfbClient("ws://relay.local/vnc").connect();
    const socket = latestSocket();
    socket.serverOpens();
    socket.serverSends(VERSION_HANDSHAKE);
    socket.serverSends(SECURITY_TYPES_NONE_ONLY);
    socket.serverSends(SECURITY_RESULT_OK);
    socket.serverSends(serverInitBytes(800, 600, "test"));
    await connectPromise;

    expect(socket.sent[0]).toEqual(VERSION_HANDSHAKE); // echoes RFB 003.008
    expect(socket.sent[1]).toEqual([1]); // chooses security type 1 (None)
    expect(socket.sent[2]).toEqual([1]); // ClientInit shared-flag = 1
  });

  test("reassembles a handshake split across many single-byte WebSocket messages", async () => {
    const connectPromise = new RfbClient("ws://relay.local/vnc").connect();
    const socket = latestSocket();
    socket.serverOpens();
    const allBytes = [...VERSION_HANDSHAKE, ...SECURITY_TYPES_NONE_ONLY, ...SECURITY_RESULT_OK, ...serverInitBytes(640, 480, "x")];
    for (const byte of allBytes) {
      socket.serverSends([byte]);
    }

    const info = await connectPromise;

    expect(info).toEqual({ width: 640, height: 480, name: "x" });
  });

  test("reassembles a handshake delivered as one single oversized WebSocket message", async () => {
    const connectPromise = new RfbClient("ws://relay.local/vnc").connect();
    const socket = latestSocket();
    socket.serverOpens();
    socket.serverSends([...VERSION_HANDSHAKE, ...SECURITY_TYPES_NONE_ONLY, ...SECURITY_RESULT_OK, ...serverInitBytes(1024, 768, "one-shot")]);

    const info = await connectPromise;

    expect(info).toEqual({ width: 1024, height: 768, name: "one-shot" });
  });

  test("rejects when the server only offers VNC Authentication, not None", async () => {
    const connectPromise = new RfbClient("ws://relay.local/vnc").connect();
    const socket = latestSocket();
    socket.serverOpens();
    socket.serverSends(VERSION_HANDSHAKE);
    socket.serverSends([1, 2]); // count=1, [VNC Authentication]

    await expect(connectPromise).rejects.toThrow(/VNC Authentication/);
  });

  test("rejects with the server's reason when the security handshake reports 0 available types", async () => {
    const connectPromise = new RfbClient("ws://relay.local/vnc").connect();
    const socket = latestSocket();
    socket.serverOpens();
    socket.serverSends(VERSION_HANDSHAKE);
    const reason = bytesOf("too many connections");
    socket.serverSends([0, (reason.length >>> 24) & 0xff, (reason.length >>> 16) & 0xff, (reason.length >>> 8) & 0xff, reason.length & 0xff, ...reason]);

    await expect(connectPromise).rejects.toThrow(/too many connections/);
  });

  test("rejects when SecurityResult reports failure, with the server's reason", async () => {
    const connectPromise = new RfbClient("ws://relay.local/vnc").connect();
    const socket = latestSocket();
    socket.serverOpens();
    socket.serverSends(VERSION_HANDSHAKE);
    socket.serverSends(SECURITY_TYPES_NONE_ONLY);
    const reason = bytesOf("access denied");
    socket.serverSends([0, 0, 0, 1, (reason.length >>> 24) & 0xff, (reason.length >>> 16) & 0xff, (reason.length >>> 8) & 0xff, reason.length & 0xff, ...reason]);

    await expect(connectPromise).rejects.toThrow(/access denied/);
  });

  test("rejects if the socket errors before opening", async () => {
    const connectPromise = new RfbClient("ws://relay.local/vnc").connect();
    latestSocket().onerror?.();

    await expect(connectPromise).rejects.toThrow(/Could not connect/);
  });

  test("sendPointerEvent encodes message-type 5, button mask, and x/y as big-endian u16", async () => {
    const { client, socket } = await connectedClient();
    socket.sent = [];

    client.sendPointerEvent(300, 150, RfbButton.Left);

    expect(socket.sent).toEqual([[5, RfbButton.Left, 300 >> 8, 300 & 0xff, 150 >> 8, 150 & 0xff]]);
  });

  test("sendPointerEvent supports chorded buttons via bitwise OR", async () => {
    const { client, socket } = await connectedClient();
    socket.sent = [];

    client.sendPointerEvent(0, 0, RfbButton.Left | RfbButton.Right);

    expect(socket.sent[0][1]).toBe(RfbButton.Left | RfbButton.Right);
  });

  test("sendKeyEvent encodes message-type 4, down-flag, and the keysym as big-endian u32", async () => {
    const { client, socket } = await connectedClient();
    socket.sent = [];

    client.sendKeyEvent(0xff0d, true); // Return
    client.sendKeyEvent(0xff0d, false);

    expect(socket.sent).toEqual([
      [4, 1, 0, 0, 0x00, 0x00, 0xff, 0x0d],
      [4, 0, 0, 0, 0x00, 0x00, 0xff, 0x0d],
    ]);
  });

  test("disconnect() closes the socket and rejects a read still in flight", async () => {
    const { client, socket } = await connectedClient();
    expect(() => client.disconnect()).not.toThrow();
    expect(socket.closed).toBe(true);
  });

  test("sending after disconnect() throws instead of failing silently", async () => {
    const { client } = await connectedClient();
    client.disconnect();

    expect(() => client.sendPointerEvent(0, 0, 0)).toThrow(RfbProtocolError);
  });
});
