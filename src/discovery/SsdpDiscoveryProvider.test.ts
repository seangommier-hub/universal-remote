import { EventEmitter } from "events";
import { ROKU_ECP_DRIVER_ID } from "../drivers/streaming/roku/RokuEcpDriver";
import { LG_WEBOS_DRIVER_ID } from "../drivers/tv/lg/LgWebOsDriver";
import { YAMAHA_MUSICCAST_DRIVER_ID } from "../drivers/tv/yamaha/YamahaMusicCastDriver";
import { flushMicrotasks } from "../testUtils/mockWebSocket";

// react-native-udp needs a real native module that doesn't exist in Jest's Node environment — a
// minimal EventEmitter-backed fake stands in for the socket, same shape as the real library's
// documented public API (bind/send/on('message')/close).
class MockUdpSocket extends EventEmitter {
  bind(_port: number, cb?: () => void) {
    cb?.();
  }
  send(_msg: string, _offset: unknown, _length: unknown, _port: number, _address: string, cb?: () => void) {
    cb?.();
  }
  close() {}
}

let mockSocket: MockUdpSocket;
jest.mock("react-native-udp", () => ({
  __esModule: true,
  default: { createSocket: jest.fn(() => mockSocket) },
}));

// Real jest fake timers so the provider's fixed scan-window wait (SEARCH_MX_SECONDS-derived)
// resolves instantly instead of the test actually waiting seconds.
beforeEach(() => {
  mockSocket = new MockUdpSocket();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function ssdpResponse(st: string, server = ""): string {
  return `HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nST: ${st}\r\nSERVER: ${server}\r\nLOCATION: http://192.168.1.50:8060/\r\n\r\n`;
}

// Imported after the mock is registered above, matching this project's own established pattern
// for module-level jest.mock + late import (see LgWebOsDriver.test.ts and siblings).
import { SsdpDiscoveryProvider, extractSsdpHeader } from "./SsdpDiscoveryProvider";

describe("extractSsdpHeader", () => {
  test("extracts a header value case-insensitively", () => {
    const response = "HTTP/1.1 200 OK\r\nST: roku:ecp\r\nserver: Roku/13.0 UPnP/1.0\r\n\r\n";
    expect(extractSsdpHeader(response, "ST")).toBe("roku:ecp");
    expect(extractSsdpHeader(response, "SERVER")).toBe("Roku/13.0 UPnP/1.0");
  });

  test("returns undefined for a missing header", () => {
    expect(extractSsdpHeader("HTTP/1.1 200 OK\r\n\r\n", "ST")).toBeUndefined();
  });
});

describe("SsdpDiscoveryProvider", () => {
  test("reports a real Roku found via its documented ST (roku:ecp)", async () => {
    const provider = new SsdpDiscoveryProvider();
    const found: unknown[] = [];
    const scanPromise = provider.scan((d) => found.push(d));
    await flushMicrotasks(); // let scan() reach its socket.on("message", ...) registration before this emits

    mockSocket.emit("message", Buffer.from(ssdpResponse("roku:ecp", "Roku/13.0 UPnP/1.0")), { address: "192.168.1.50" });
    jest.runAllTimers();
    await scanPromise;

    expect(found).toEqual([
      {
        id: "ssdp-192.168.1.50-" + ROKU_ECP_DRIVER_ID,
        name: "Roku (192.168.1.50)",
        category: "streaming",
        manufacturer: "Roku",
        driverId: ROKU_ECP_DRIVER_ID,
        metadata: { ipAddress: "192.168.1.50" },
      },
    ]);
  });

  test("reports a real LG TV found via its documented ST", async () => {
    const provider = new SsdpDiscoveryProvider();
    const found: unknown[] = [];
    const scanPromise = provider.scan((d) => found.push(d));
    await flushMicrotasks();

    mockSocket.emit("message", Buffer.from(ssdpResponse("urn:lge-com:service:webos-second-screen:1")), { address: "192.168.1.60" });
    jest.runAllTimers();
    await scanPromise;

    expect(found).toEqual([expect.objectContaining({ manufacturer: "LG", driverId: LG_WEBOS_DRIVER_ID })]);
  });

  test("Yamaha's generic MediaRenderer ST is only accepted when the SERVER string also confirms the brand", async () => {
    const provider = new SsdpDiscoveryProvider();
    const found: unknown[] = [];
    const scanPromise = provider.scan((d) => found.push(d));
    await flushMicrotasks();

    // A non-Yamaha device answering the same generic MediaRenderer ST — must be rejected.
    mockSocket.emit("message", Buffer.from(ssdpResponse("urn:schemas-upnp-org:device:MediaRenderer:1", "Sonos/70.0")), { address: "192.168.1.70" });
    // A real Yamaha device — must be accepted.
    mockSocket.emit("message", Buffer.from(ssdpResponse("urn:schemas-upnp-org:device:MediaRenderer:1", "Yamaha Corporation")), { address: "192.168.1.71" });
    jest.runAllTimers();
    await scanPromise;

    expect(found).toEqual([expect.objectContaining({ manufacturer: "Yamaha", driverId: YAMAHA_MUSICCAST_DRIVER_ID, metadata: { ipAddress: "192.168.1.71" } })]);
  });

  test("ignores an ST it doesn't recognize", async () => {
    const provider = new SsdpDiscoveryProvider();
    const found: unknown[] = [];
    const scanPromise = provider.scan((d) => found.push(d));
    await flushMicrotasks();

    mockSocket.emit("message", Buffer.from(ssdpResponse("urn:some-other-vendor:device:1")), { address: "192.168.1.80" });
    jest.runAllTimers();
    await scanPromise;

    expect(found).toEqual([]);
  });

  test("ignores a non-200 response", async () => {
    const provider = new SsdpDiscoveryProvider();
    const found: unknown[] = [];
    const scanPromise = provider.scan((d) => found.push(d));
    await flushMicrotasks();

    mockSocket.emit("message", Buffer.from("HTTP/1.1 404 NOT FOUND\r\n\r\n"), { address: "192.168.1.90" });
    jest.runAllTimers();
    await scanPromise;

    expect(found).toEqual([]);
  });

  test("dedupes the same device replying more than once to the same search", async () => {
    const provider = new SsdpDiscoveryProvider();
    const found: unknown[] = [];
    const scanPromise = provider.scan((d) => found.push(d));
    await flushMicrotasks();

    mockSocket.emit("message", Buffer.from(ssdpResponse("roku:ecp")), { address: "192.168.1.50" });
    mockSocket.emit("message", Buffer.from(ssdpResponse("roku:ecp")), { address: "192.168.1.50" });
    jest.runAllTimers();
    await scanPromise;

    expect(found).toHaveLength(1);
  });

  test("resolves without throwing if the socket fails to bind (e.g. multicast entitlement not granted on iOS)", async () => {
    // Real device behavior when the multicast entitlement isn't granted: bind can fail outright
    // rather than just receiving nothing — this must degrade to "found nothing", never throw, the
    // same treatment FCC's own DiscoveryProvider gives an unconfigured Pi. Emitted synchronously
    // (the "error" listener is already attached by the time scan() calls bind()) to sidestep any
    // interaction with this file's fake timers.
    mockSocket.bind = (_port: number, _cb?: () => void) => {
      mockSocket.emit("error", new Error("Operation not permitted"));
    };
    const provider = new SsdpDiscoveryProvider();
    const found: unknown[] = [];

    await expect(provider.scan((d) => found.push(d))).resolves.toBeUndefined();
    expect(found).toEqual([]);
  });
});
