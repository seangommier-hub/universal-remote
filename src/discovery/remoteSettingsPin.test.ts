import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { fetchRemoteSettingsPinIsSet, isValidRemoteSettingsPin, saveRemoteSettingsPin } from "./remoteSettingsPin";

// ADR-HEARTH-209: same mocking pattern as householdRemotes.test.ts.

jest.mock("../core/network/fccRequest", () => ({ fccFetch: jest.fn() }));
jest.mock("./familyCommandCenterConfig", () => ({ loadFamilyCommandCenterConfig: jest.fn() }));

const fetchMock = fccFetch as jest.Mock;
const configMock = loadFamilyCommandCenterConfig as jest.Mock;

function respond(status: number, body: unknown = {}): void {
  fetchMock.mockResolvedValueOnce({ status, ok: status >= 200 && status < 300, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  configMock.mockReset().mockResolvedValue({ baseUrl: "http://pi", token: "t" });
});

describe("remoteSettingsPin", () => {
  test("accepts 4 to 8 digits only", () => {
    expect(isValidRemoteSettingsPin("1234")).toBe(true);
    expect(isValidRemoteSettingsPin("12345678")).toBe(true);
    expect(isValidRemoteSettingsPin("123")).toBe(false);
    expect(isValidRemoteSettingsPin("12a4")).toBe(false);
  });

  test("reads whether a PIN is set", async () => {
    respond(200, { isSet: true });
    await expect(fetchRemoteSettingsPinIsSet()).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][1]).toBe("/api/integrations/hearth/physical-remote/settings-pin");
  });

  test("saves the PIN with a PUT", async () => {
    respond(200, { ok: true });
    await saveRemoteSettingsPin("4826");
    expect(fetchMock.mock.calls[0][2]).toEqual({ method: "PUT", body: JSON.stringify({ pin: "4826" }) });
  });

  test("never sends a malformed PIN", async () => {
    await expect(saveRemoteSettingsPin("12")).rejects.toThrow("4 to 8 digits");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a non-owner phone gets a plain explanation", async () => {
    respond(403);
    await expect(saveRemoteSettingsPin("4826")).rejects.toThrow("Only the household owner");
  });
});
