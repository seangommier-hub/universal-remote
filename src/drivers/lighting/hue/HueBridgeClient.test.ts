import { HueBridgeClient, HuePairingPendingError } from "./HueBridgeClient";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("HueBridgeClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  describe("pair", () => {
    test("returns the username on success", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ success: { username: "abc123" } }]));
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      const username = await client.pair("hearth#living-room");

      expect(username).toBe("abc123");
      expect(global.fetch).toHaveBeenCalledWith(
        "http://192.168.1.50:80/api",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ devicetype: "hearth#living-room" }) })
      );
    });

    test("throws HuePairingPendingError when the link button hasn't been pressed (Hue error type 101)", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        jsonResponse([{ error: { type: 101, description: "link button not pressed" } }])
      );
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      await expect(client.pair("hearth#living-room")).rejects.toBeInstanceOf(HuePairingPendingError);
    });

    test("throws a real error for any other pairing failure", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ error: { type: 1, description: "unauthorized" } }]));
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      await expect(client.pair("hearth#living-room")).rejects.toThrow(/unauthorized/);
    });

    test("throws on a non-OK HTTP response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(null, false, 500));
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      await expect(client.pair("hearth#living-room")).rejects.toThrow("HTTP 500");
    });
  });

  describe("getLightState", () => {
    test("normalizes Hue's native bri/hue/sat scales to universal 0-100/0-360/0-100 units", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        jsonResponse({ state: { on: true, bri: 254, hue: 65535, sat: 254, reachable: true }, name: "Lamp" })
      );
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      const state = await client.getLightState("abc123", "1");

      expect(state).toEqual({ on: true, brightness: 100, hue: 360, saturation: 100, reachable: true, name: "Lamp" });
      expect(global.fetch).toHaveBeenCalledWith("http://192.168.1.50:80/api/abc123/lights/1", expect.objectContaining({ method: "GET" }));
    });

    test("minimum brightness (bri: 1) normalizes to 0%", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ state: { on: false, bri: 1, reachable: true } }));
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      const state = await client.getLightState("abc123", "1");

      expect(state.brightness).toBe(0);
    });

    test("throws on a non-OK response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(null, false, 404));
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      await expect(client.getLightState("abc123", "1")).rejects.toThrow("HTTP 404");
    });
  });

  describe("setLightState", () => {
    test("PUTs only the fields provided, converted to Hue's native scales", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ success: { "/lights/1/state/on": true } }]));
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      await client.setLightState("abc123", "1", { on: true });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://192.168.1.50:80/api/abc123/lights/1/state",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ on: true }) })
      );
    });

    test("converts 50% brightness to Hue's native ~128 (1-254 scale)", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ success: {} }]));
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      await client.setLightState("abc123", "1", { brightness: 50 });

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(call[1].body)).toEqual({ bri: 128 });
    });

    test("converts 180 degrees hue and 50% saturation to Hue's native scales", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ success: {} }]));
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      await client.setLightState("abc123", "1", { hue: 180, saturation: 50 });

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(call[1].body)).toEqual({ hue: 32768, sat: 127 });
    });

    test("throws on a non-OK HTTP response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(null, false, 500));
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      await expect(client.setLightState("abc123", "1", { on: true })).rejects.toThrow("HTTP 500");
    });

    test("throws when the bridge reports a per-field error even with an OK HTTP response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        jsonResponse([{ error: { type: 201, description: "parameter, bri, is not modifiable" } }])
      );
      const client = new HueBridgeClient({ bridgeIpAddress: "192.168.1.50" });

      await expect(client.setLightState("abc123", "1", { brightness: 50 })).rejects.toThrow(/not modifiable/);
    });
  });
});
