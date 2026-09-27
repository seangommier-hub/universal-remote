import { FamilyCommandCenterNotConfiguredError, GoveeApiError, getStatus, setBrightness, setColor, setPower } from "./GoveeClient";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

const FCC_CONFIG = { baseUrl: "http://192.168.1.172:3210", token: "fcc-token" };

beforeEach(() => {
  mockLoadConfig.mockReset();
  global.fetch = jest.fn();
});

describe("getStatus", () => {
  test("fetches real-time on/off, brightness and color from Family Command Center's Govee proxy, bearer-authenticated", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onOff: true, brightness: 80, color: { r: 10, g: 20, b: 30 } }),
    });

    const status = await getStatus("192.168.1.60");

    expect(status).toEqual({ onOff: true, brightness: 80, color: { r: 10, g: 20, b: 30 } });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/govee/status?ip=192.168.1.60",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fcc-token" }) })
    );
  });

  test("throws FamilyCommandCenterNotConfiguredError when Family Command Center isn't paired yet", async () => {
    mockLoadConfig.mockResolvedValue(null);

    await expect(getStatus("192.168.1.60")).rejects.toThrow(FamilyCommandCenterNotConfiguredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("surfaces the Pi's specific LAN-Control/cloud-only message, not a generic error, when the light never answers", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 504,
      json: async () => ({ error: "The Govee device did not answer — check that LAN Control is turned on for this device in the Govee Home app, or it may only support Govee's cloud API" }),
    });

    await expect(getStatus("192.168.1.60")).rejects.toMatchObject({
      status: 504,
      message: expect.stringContaining("LAN Control"),
    });
  });

  test("times out and surfaces a clear, retry-able error instead of hanging forever (same real-hardware-pattern finding as KasaClient.test.ts)", async () => {
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

    await expect(getStatus("192.168.1.60")).rejects.toThrow(/didn't respond within/);
  }, 12000);
});

describe("setPower", () => {
  test("POSTs the desired on/off state alongside the light's IP", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await setPower("192.168.1.60", true);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/govee/turn",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ip: "192.168.1.60", on: true }) })
    );
  });

  test("throws GoveeApiError when Family Command Center rejects the IP as not a known device (SSRF gate)", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Not a known device on this network" }),
    });

    await expect(setPower("10.0.0.99", true)).rejects.toBeInstanceOf(GoveeApiError);
  });
});

describe("setBrightness", () => {
  test("POSTs the requested value", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await setBrightness("192.168.1.60", 42);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/govee/brightness",
      expect.objectContaining({ body: JSON.stringify({ ip: "192.168.1.60", value: 42 }) })
    );
  });
});

describe("setColor", () => {
  test("POSTs the requested RGB channels", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await setColor("192.168.1.60", 10, 20, 30);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/govee/color",
      expect.objectContaining({ body: JSON.stringify({ ip: "192.168.1.60", r: 10, g: 20, b: 30 }) })
    );
  });
});
