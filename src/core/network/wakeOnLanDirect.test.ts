import { sendWakeOnLanDirect } from "./wakeOnLanDirect";
import * as Network from "expo-network";

jest.mock("expo-network", () => ({
  getIpAddressAsync: jest.fn(),
}));

const mockSocket = {
  once: jest.fn(),
  bind: jest.fn(),
  setBroadcast: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
};

jest.mock("react-native-jsi-udp", () => ({
  __esModule: true,
  default: { createSocket: jest.fn(() => mockSocket) },
}));

describe("sendWakeOnLanDirect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Network.getIpAddressAsync as jest.Mock).mockResolvedValue("192.168.1.44");
    mockSocket.bind.mockImplementation((_port: number, _addr: unknown, cb: () => void) => cb());
    mockSocket.send.mockImplementation((_packet, _offset, _len, _port, _addr, cb: (err: Error | null) => void) => cb(null));
  });

  test("broadcasts to the phone's own /24 subnet, derived from its current WiFi address", async () => {
    await sendWakeOnLanDirect("F8:B9:5A:43:7E:3E");

    expect(mockSocket.setBroadcast).toHaveBeenCalledWith(true);
    expect(mockSocket.send).toHaveBeenCalledWith(
      expect.any(Buffer),
      0,
      102, // 6 bytes of 0xff + 16 * 6-byte MAC
      9,
      "192.168.1.255",
      expect.any(Function)
    );
    expect(mockSocket.close).toHaveBeenCalled();
  });

  test("builds a real 102-byte magic packet: 6 bytes of 0xff followed by the MAC repeated 16 times", async () => {
    await sendWakeOnLanDirect("AA:BB:CC:DD:EE:FF");

    const packet = mockSocket.send.mock.calls[0][0] as Buffer;
    expect(packet.length).toBe(102);
    expect(packet.subarray(0, 6)).toEqual(Buffer.alloc(6, 0xff));
    expect(packet.subarray(6, 12)).toEqual(Buffer.from("AABBCCDDEEFF", "hex"));
    expect(packet.subarray(96, 102)).toEqual(Buffer.from("AABBCCDDEEFF", "hex"));
  });

  test("rejects an invalid MAC address before ever touching the socket", async () => {
    await expect(sendWakeOnLanDirect("not-a-mac")).rejects.toThrow(/Invalid MAC address/);
    expect(mockSocket.send).not.toHaveBeenCalled();
  });

  test("fails clearly when the phone's own IP address can't be determined", async () => {
    (Network.getIpAddressAsync as jest.Mock).mockResolvedValue("0.0.0.0");
    await expect(sendWakeOnLanDirect("F8:B9:5A:43:7E:3E")).rejects.toThrow(/Could not determine/);
  });

  test("propagates a real send failure from the socket", async () => {
    mockSocket.send.mockImplementation((_p, _o, _l, _port, _addr, cb: (err: Error | null) => void) => cb(new Error("ENETUNREACH")));
    await expect(sendWakeOnLanDirect("F8:B9:5A:43:7E:3E")).rejects.toThrow(/ENETUNREACH/);
    expect(mockSocket.close).toHaveBeenCalled(); // closed even on failure
  });
});
