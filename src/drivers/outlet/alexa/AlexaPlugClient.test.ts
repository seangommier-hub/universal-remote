import { AlexaBridgeError, FamilyCommandCenterNotConfiguredError, isAlexaNotLinkedError, listPlugs, setPlugState } from "./AlexaPlugClient";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

const FCC_CONFIG = { baseUrl: "http://192.168.1.172:3210", token: "fcc-token" };

beforeEach(() => {
  mockLoadConfig.mockReset();
  global.fetch = jest.fn();
});

describe("listPlugs", () => {
  test("fetches the plug list from the Family Command Center's proxy endpoint, bearer-authenticated", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugs: [{ id: "p1", name: "Living Room Lamp", manufacturer: "Amazon", on: true, reachable: true }] }),
    });

    const plugs = await listPlugs();

    expect(plugs).toEqual([{ id: "p1", name: "Living Room Lamp", manufacturer: "Amazon", on: true, reachable: true }]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/alexa/plugs",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fcc-token" }) })
    );
  });

  test("throws FamilyCommandCenterNotConfiguredError when Family Command Center isn't paired yet", async () => {
    mockLoadConfig.mockResolvedValue(null);

    await expect(listPlugs()).rejects.toThrow(FamilyCommandCenterNotConfiguredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("preserves the plug list's on:null exactly (never coerced to false/off)", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugs: [{ id: "p1", name: "Office Fan", manufacturer: "Amazon", on: null, reachable: true }] }),
    });

    const [plug] = await listPlugs();

    expect(plug.on).toBeNull();
  });

  test("throws AlexaBridgeError with the real status when the response has no usable body", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(listPlugs()).rejects.toMatchObject({ status: 500, message: "Family Command Center returned 500" });
  });

  test("surfaces the bridge's own 'Amazon isn't signed in' message verbatim on a 502, not a generic status message", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: "Amazon isn't signed in yet on Family Command Center — finish the one-time sign-in there first." }),
    });

    const error = await listPlugs().catch((err) => err);

    expect(error).toBeInstanceOf(AlexaBridgeError);
    expect(error.status).toBe(502);
    expect(error.message).toBe("Amazon isn't signed in yet on Family Command Center — finish the one-time sign-in there first.");
    expect(isAlexaNotLinkedError(error)).toBe(true);
  });

  test("surfaces the bridge's own 'bridge is down' message verbatim on a 502 -- a distinct message from the sign-in case", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: "The Alexa bridge isn't running on Family Command Center right now." }),
    });

    const error = await listPlugs().catch((err) => err);

    expect(error.message).toBe("The Alexa bridge isn't running on Family Command Center right now.");
    expect(isAlexaNotLinkedError(error)).toBe(true);
  });

  test(
    "times out and surfaces a clear, retry-able error instead of hanging forever",
    async () => {
      // Real timers deliberately, not fake ones -- same tradeoff as SmartThingsClient.test.ts's
      // equivalent test (AbortController's event dispatch interacting with fake-timer microtask
      // ordering has proven flaky here before).
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

      await expect(listPlugs()).rejects.toThrow(/didn't respond within/);
    },
    12000
  );
});

describe("setPlugState", () => {
  test("POSTs the new state to the plug-specific proxy route", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await setPlugState("p1", "off");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/alexa/plugs/p1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ state: "off" }) })
    );
  });
});

describe("isAlexaNotLinkedError", () => {
  test("is false for any other error, including a non-502 AlexaBridgeError", () => {
    expect(isAlexaNotLinkedError(new AlexaBridgeError("nope", 400))).toBe(false);
    expect(isAlexaNotLinkedError(new Error("plain error"))).toBe(false);
  });
});
