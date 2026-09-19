import { EventEmitter } from "events";

// Same fake-socket approach as SsdpDiscoveryProvider.test.ts — react-native-udp needs a real
// native module that doesn't exist in Jest's Node environment.
class MockUdpSocket extends EventEmitter {
  sentMessages: { message: string; port: number; address: string }[] = [];
  bind(_port: number, cb?: () => void) {
    cb?.();
  }
  send(message: string, _offset: unknown, _length: unknown, port: number, address: string, cb?: (err?: Error) => void) {
    this.sentMessages.push({ message, port, address });
    cb?.();
  }
  close() {}
}

let mockSocket: MockUdpSocket;
jest.mock("react-native-udp", () => ({
  __esModule: true,
  default: { createSocket: jest.fn(() => mockSocket) },
}));

beforeEach(() => {
  mockSocket = new MockUdpSocket();
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Imported after the mock is registered, matching SsdpDiscoveryProvider.test.ts's own established pattern.
import { Ps5Client, Ps5PairingTimeoutError } from "./Ps5Client";

function ddpRequest(type: string, fields: Record<string, string> = {}): string {
  const lines = [`${type} * HTTP/1.1`, ...Object.entries(fields).map(([k, v]) => `${k}:${v}`), "device-discovery-protocol-version:00020020", ""];
  return lines.join("\n");
}

describe("Ps5Client", () => {
  describe("captureCredentials", () => {
    test("answers a SRCH probe with a standby-status DDP response, mimicking a real console", async () => {
      const client = new Ps5Client();
      const onListening = jest.fn();
      const capturePromise = client.captureCredentials("Hearth", onListening);
      await flushMicrotasks();
      expect(onListening).toHaveBeenCalled();

      mockSocket.emit("message", Buffer.from(ddpRequest("SRCH")), { address: "192.168.1.5", port: 987 });
      await flushMicrotasks();

      expect(mockSocket.sentMessages).toHaveLength(1);
      expect(mockSocket.sentMessages[0].address).toBe("192.168.1.5");
      expect(mockSocket.sentMessages[0].port).toBe(987);
      expect(mockSocket.sentMessages[0].message).toContain("HTTP/1.1 620 Server Standby");
      expect(mockSocket.sentMessages[0].message).toContain("host-name:Hearth");

      // Resolve the pending promise so the test doesn't leave a dangling timer.
      mockSocket.emit("message", Buffer.from(ddpRequest("WAKEUP", { "client-type": "a", "auth-type": "R", "user-credential": "abc123" })), {
        address: "192.168.1.5",
        port: 987,
      });
      await capturePromise;
    });

    test("resolves with the real client-type/auth-type/user-credential fields from a WAKEUP packet", async () => {
      const client = new Ps5Client();
      const capturePromise = client.captureCredentials("Hearth", () => {});
      await flushMicrotasks();

      mockSocket.emit("message", Buffer.from(ddpRequest("WAKEUP", { "client-type": "a", "auth-type": "R", "user-credential": "9876543210ABCDEF" })), {
        address: "192.168.1.5",
        port: 987,
      });

      await expect(capturePromise).resolves.toEqual({ clientType: "a", authType: "R", userCredential: "9876543210ABCDEF" });
    });

    test("ignores a WAKEUP packet missing any required field rather than resolving with a partial credential", async () => {
      const client = new Ps5Client();
      const capturePromise = client.captureCredentials("Hearth", () => {});
      await flushMicrotasks();

      mockSocket.emit("message", Buffer.from(ddpRequest("WAKEUP", { "client-type": "a" })), { address: "192.168.1.5", port: 987 });
      await flushMicrotasks();

      mockSocket.emit("message", Buffer.from(ddpRequest("WAKEUP", { "client-type": "a", "auth-type": "R", "user-credential": "real-one" })), {
        address: "192.168.1.5",
        port: 987,
      });

      await expect(capturePromise).resolves.toEqual({ clientType: "a", authType: "R", userCredential: "real-one" });
    });

    test("rejects with a clear error if the socket fails to bind port 987", async () => {
      mockSocket.bind = (_port: number, _cb?: () => void) => {
        mockSocket.emit("error", new Error("EADDRINUSE"));
      };
      const client = new Ps5Client();
      await expect(client.captureCredentials("Hearth", () => {})).rejects.toThrow(/Could not listen on UDP port 987/);
    });

    test("times out with a real, actionable error if nothing ever taps the device in the PlayStation App", async () => {
      jest.useFakeTimers();
      const client = new Ps5Client();
      const capturePromise = client.captureCredentials("Hearth", () => {});
      await Promise.resolve(); // let bind()'s callback run before advancing timers
      jest.runAllTimers();
      await expect(capturePromise).rejects.toBeInstanceOf(Ps5PairingTimeoutError);
      jest.useRealTimers();
    });
  });

  describe("sendWake", () => {
    test("sends a DDP WAKEUP packet with the exact captured credentials to the console's own IP, port 987", async () => {
      const client = new Ps5Client();
      await client.sendWake("192.168.1.210", { clientType: "a", authType: "R", userCredential: "abc123" });

      expect(mockSocket.sentMessages).toHaveLength(1);
      const sent = mockSocket.sentMessages[0];
      expect(sent.address).toBe("192.168.1.210");
      expect(sent.port).toBe(987);
      expect(sent.message).toContain("WAKEUP * HTTP/1.1");
      expect(sent.message).toContain("client-type:a");
      expect(sent.message).toContain("auth-type:R");
      expect(sent.message).toContain("user-credential:abc123");
    });
  });
});
