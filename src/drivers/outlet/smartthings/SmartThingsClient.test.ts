import { FamilyCommandCenterNotConfiguredError, SmartThingsApiError, listOutlets, setOutletState } from "./SmartThingsClient";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

const FCC_CONFIG = { baseUrl: "http://192.168.1.172:3210", token: "fcc-token" };

beforeEach(() => {
  mockLoadConfig.mockReset();
  global.fetch = jest.fn();
});

describe("listOutlets", () => {
  test("fetches the outlet list from the Family Command Center's proxy endpoint, bearer-authenticated", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ outlets: [{ id: "d1", label: "Living Room Lamp", state: "on" }] }),
    });

    const outlets = await listOutlets();

    expect(outlets).toEqual([{ id: "d1", label: "Living Room Lamp", state: "on" }]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/smartthings/outlets",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fcc-token" }) })
    );
  });

  test("throws FamilyCommandCenterNotConfiguredError when Family Command Center isn't paired yet", async () => {
    mockLoadConfig.mockResolvedValue(null);

    await expect(listOutlets()).rejects.toThrow(FamilyCommandCenterNotConfiguredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("throws SmartThingsApiError with the real status on a non-ok response", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 502 });

    await expect(listOutlets()).rejects.toMatchObject({ status: 502 });
  });
});

describe("setOutletState", () => {
  test("POSTs the new state to the device-specific proxy route", async () => {
    mockLoadConfig.mockResolvedValue(FCC_CONFIG);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await setOutletState("d1", "off");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/smartthings/outlets/d1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ state: "off" }) })
    );
  });
});
