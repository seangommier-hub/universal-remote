import { FamilyCommandCenterNotConfiguredError, KasaApiError, getSysInfo, setRelayState } from "./KasaClient";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

const FCC_CONFIG = { baseUrl: "http://192.168.1.172:3210", token: "fcc-token" };

beforeEach(() => {
  mockLoadConfig.mockReset();
  global.fetch = jest.fn();
});

describe("getSysInfo", () => {
  test("fetches real-time relay state from Family Command Center's Kasa proxy, bearer-authenticated", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ relayState: true, alias: "Christmas Lights", model: "HS103(US)" }),
    });

    const info = await getSysInfo("192.168.1.50");

    expect(info).toEqual({ relayState: true, alias: "Christmas Lights", model: "HS103(US)" });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/kasa/sysinfo?ip=192.168.1.50",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fcc-token" }) })
    );
  });

  test("throws FamilyCommandCenterNotConfiguredError when Family Command Center isn't paired yet", async () => {
    mockLoadConfig.mockResolvedValue(null);

    await expect(getSysInfo("192.168.1.50")).rejects.toThrow(FamilyCommandCenterNotConfiguredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("throws KasaApiError with the server's own error message on a non-ok response (e.g. an unsupported-protocol plug)", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: "Kasa device at 192.168.1.50 didn't respond with the expected legacy protocol — it may use newer TP-Link firmware this integration doesn't support yet." }),
    });

    await expect(getSysInfo("192.168.1.50")).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("newer TP-Link firmware"),
    });
  });

  test(
    "times out and surfaces a clear, retry-able error instead of hanging forever (same real-hardware-pattern finding as SmartThingsClient.test.ts, 2026-09-12)",
    async () => {
      mockLoadConfig.mockResolvedValue(FCC_CONFIG);
      (global.fetch as jest.Mock).mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          })
      );

      await expect(getSysInfo("192.168.1.50")).rejects.toThrow(/didn't respond within/);
    },
    12000
  );
});

describe("setRelayState", () => {
  test("POSTs the desired on/off state alongside the plug's IP", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await setRelayState("192.168.1.50", true);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/kasa/set-relay-state",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ip: "192.168.1.50", state: "on" }) })
    );
  });

  test("sends state 'off' when turning off", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await setRelayState("192.168.1.50", false);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ ip: "192.168.1.50", state: "off" }) })
    );
  });

  test("throws KasaApiError when Family Command Center rejects the IP as not a known device (SSRF gate)", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Not a known device on this network" }),
    });

    await expect(setRelayState("10.0.0.99", true)).rejects.toBeInstanceOf(KasaApiError);
  });
});
