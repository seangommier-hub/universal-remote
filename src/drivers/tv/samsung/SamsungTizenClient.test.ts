import { SamsungPairingError, SamsungTizenClient } from "./SamsungTizenClient";
import { installMockWebSocket, MockWebSocket } from "../../../testUtils/mockWebSocket";

describe("SamsungTizenClient", () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  test("connects to the unencrypted port 8001 endpoint with a base64-encoded app name", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60", appName: "Hearth" });
    const connectPromise = client.connect();

    const socket = MockWebSocket.latest();
    expect(socket.url).toBe("ws://192.168.1.60:8001/api/v2/channels/samsung.remote.control?name=SGVhcnRo");

    socket.simulateMessage({ event: "ms.channel.connect", data: {} });
    await expect(connectPromise).resolves.toBeUndefined();
  });

  test("rejects with SamsungPairingError when the TV denies pairing", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60" });
    const connectPromise = client.connect();

    MockWebSocket.latest().simulateMessage({ event: "ms.channel.unauthorized" });

    await expect(connectPromise).rejects.toBeInstanceOf(SamsungPairingError);
  });

  test("rejects on a socket error", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60" });
    const connectPromise = client.connect();

    MockWebSocket.latest().simulateError();

    await expect(connectPromise).rejects.toThrow(/Could not open/);
  });

  test("sendKey sends the documented ms.remote.control envelope once connected", async () => {
    const client = new SamsungTizenClient({ ipAddress: "192.168.1.60" });
    const connectPromise = client.connect();
    const socket = MockWebSocket.latest();
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
