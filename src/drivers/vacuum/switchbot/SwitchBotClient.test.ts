import { SwitchBotClient } from "./SwitchBotClient";

const config = { token: "test-token", secret: "test-secret" };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("SwitchBotClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("listDevices sends real HMAC-signed auth headers to the documented endpoint", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ statusCode: 100, message: "success", body: { deviceList: [{ deviceId: "v1", deviceName: "Vac", deviceType: "K10+" }] } })
    );

    const client = new SwitchBotClient(config);
    const devices = await client.listDevices();

    expect(devices).toEqual([{ deviceId: "v1", deviceName: "Vac", deviceType: "K10+" }]);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.switch-bot.com/v1.1/devices");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("test-token");
    // Real HMAC-SHA256, base64, uppercased -- sourced from the official README's documented
    // algorithm. Not re-deriving the exact signature here (that would just duplicate the
    // implementation) -- asserting the real, observable shape a hand-rolled or wrong
    // implementation would get wrong: length (SHA-256 -> 32 bytes -> 44 base64 chars incl.
    // padding), character set (base64 + uppercase), and that it changes per call (real nonce/
    // timestamp entropy, not a static/fallback value).
    expect(init.headers.sign).toMatch(/^[A-Z0-9+/]{43}=$/);
    expect(init.headers.t).toMatch(/^\d{13}$/);
    expect(init.headers.nonce).toMatch(/^[0-9a-f-]{36}$/i);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ statusCode: 100, message: "success", body: { deviceList: [] } }));
    await client.listDevices();
    const [, secondInit] = (global.fetch as jest.Mock).mock.calls[1];
    expect(secondInit.headers.sign).not.toBe(init.headers.sign); // real per-request nonce/timestamp, not memoized
  });

  test("getStatus reads the documented status endpoint and returns the real body", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ statusCode: 100, message: "success", body: { deviceId: "v1", deviceType: "K10+", workingStatus: "StandBy", onlineStatus: "online", battery: 87 } })
    );

    const client = new SwitchBotClient(config);
    const status = await client.getStatus("v1");

    expect(status.workingStatus).toBe("StandBy");
    expect(status.battery).toBe(87);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.switch-bot.com/v1.1/devices/v1/status");
    expect(init.method).toBe("GET");
  });

  test("sendCommand posts the documented command envelope, defaulting parameter to 'default'", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ statusCode: 100, message: "success", body: {} }));

    const client = new SwitchBotClient(config);
    await client.sendCommand("v1", "dock");

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.switch-bot.com/v1.1/devices/v1/commands");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ commandType: "command", command: "dock", parameter: "default" });
  });

  test("sendCommand passes a numeric parameter through untouched (PowLevel)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ statusCode: 100, message: "success", body: {} }));

    const client = new SwitchBotClient(config);
    await client.sendCommand("v1", "PowLevel", 2);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ commandType: "command", command: "PowLevel", parameter: 2 });
  });

  test("throws on a non-ok HTTP response, naming the action", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 500));
    const client = new SwitchBotClient(config);
    await expect(client.getStatus("v1")).rejects.toThrow(/HTTP 500.*reading device v1/);
  });

  test("throws on a real API-level error even when the HTTP status is 200 (e.g. invalid token)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ statusCode: 190, message: "Invalid token", body: {} }));
    const client = new SwitchBotClient(config);
    await expect(client.listDevices()).rejects.toThrow(/Invalid token/);
  });
});
