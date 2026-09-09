import { SonyBraviaApiError, SonyBraviaClient } from "./SonyBraviaClient";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("SonyBraviaClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("posts a JSON-RPC envelope to the correct sony service endpoint with the PSK header", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ result: [{ status: "active" }], id: 1 }));
    const client = new SonyBraviaClient({ ipAddress: "192.168.1.50", psk: "secret-psk" });

    await client.call("system", "getPowerStatus");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.50/sony/system",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Auth-PSK": "secret-psk", "Content-Type": "application/json" }),
      })
    );
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ method: "getPowerStatus", version: "1.0" });
  });

  test("returns the result field on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ result: [{ status: "active" }], id: 1 }));
    const client = new SonyBraviaClient({ ipAddress: "192.168.1.50", psk: "secret-psk" });

    const result = await client.call("system", "getPowerStatus");

    expect(result).toEqual([{ status: "active" }]);
  });

  test("throws SonyBraviaApiError on a JSON-RPC error response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ error: [401, "Illegal State"], id: 1 }));
    const client = new SonyBraviaClient({ ipAddress: "192.168.1.50", psk: "wrong-psk" });

    await expect(client.call("system", "getPowerStatus")).rejects.toThrow(SonyBraviaApiError);
  });

  test("throws on a non-OK HTTP response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 403));
    const client = new SonyBraviaClient({ ipAddress: "192.168.1.50", psk: "bad" });

    await expect(client.call("system", "getPowerStatus")).rejects.toThrow("HTTP 403");
  });
});
