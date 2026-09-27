import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig, saveOwnRole } from "./familyCommandCenterConfig";
import {
  fetchHouseholdPhones,
  fetchOwnIdentity,
  HouseholdPhonesError,
  refreshOwnRole,
  renameHouseholdPhone,
  revokeHouseholdPhone,
  setHouseholdPhoneRole,
} from "./householdPhones";

// ADR-HEARTH-189, phase 2: same mocking pattern as familyCommandCenterActivities.test.ts -- mocks
// the shared fccFetch client and the saved config, since a real network/AsyncStorage round trip
// isn't the point of these tests.

jest.mock("../core/network/fccRequest", () => ({ fccFetch: jest.fn() }));
jest.mock("./familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
  saveOwnRole: jest.fn(),
}));

const fetchMock = fccFetch as jest.Mock;
const configMock = loadFamilyCommandCenterConfig as jest.Mock;
const saveOwnRoleMock = saveOwnRole as jest.Mock;
const CONFIG = { baseUrl: "http://pi", token: "t" };

function respond(status: number, body: unknown = {}): void {
  fetchMock.mockResolvedValueOnce({ status, ok: status >= 200 && status < 300, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  configMock.mockReset().mockResolvedValue(CONFIG);
  saveOwnRoleMock.mockReset().mockResolvedValue(true);
});

describe("fetchOwnIdentity / refreshOwnRole", () => {
  test("fetchOwnIdentity returns the parsed self response", async () => {
    respond(200, { id: "p1", phoneName: "Sean's iPhone", role: "owner" });
    await expect(fetchOwnIdentity()).resolves.toEqual({ id: "p1", phoneName: "Sean's iPhone", role: "owner" });
    expect(fetchMock.mock.calls[0][1]).toBe("/api/integrations/hearth/phone-tokens/self");
  });

  test("refreshOwnRole caches the role and returns it", async () => {
    respond(200, { id: "p1", phoneName: "Sean's iPhone", role: "adult" });
    await expect(refreshOwnRole()).resolves.toBe("adult");
    expect(saveOwnRoleMock).toHaveBeenCalledWith("adult");
  });

  test("refreshOwnRole never throws -- a failed refresh just returns null", async () => {
    respond(401);
    await expect(refreshOwnRole()).resolves.toBeNull();
    expect(saveOwnRoleMock).not.toHaveBeenCalled();
  });

  test("refreshOwnRole returns null (not a rejection) when nothing is configured at all", async () => {
    configMock.mockResolvedValue(null);
    await expect(refreshOwnRole()).resolves.toBeNull();
  });
});

describe("fetchHouseholdPhones", () => {
  test("returns the tokens array from the admin list route", async () => {
    respond(200, { tokens: [{ id: "p1", phoneName: "Sean's iPhone", role: "owner" }] });
    await expect(fetchHouseholdPhones()).resolves.toEqual([{ id: "p1", phoneName: "Sean's iPhone", role: "owner" }]);
  });

  test("a non-owner phone's 403 becomes HouseholdPhonesError('forbidden')", async () => {
    respond(403);
    await expect(fetchHouseholdPhones()).rejects.toMatchObject({ reason: "forbidden" });
  });

  test("a malformed body (no tokens array) is treated as an empty list, not a crash", async () => {
    respond(200, {});
    await expect(fetchHouseholdPhones()).resolves.toEqual([]);
  });
});

describe("mutating admin actions map status codes to plain reasons", () => {
  test("setHouseholdPhoneRole sends {id, role} and resolves on 200", async () => {
    respond(200, { ok: true });
    await expect(setHouseholdPhoneRole("p2", "owner")).resolves.toBeUndefined();
    const [, , init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ id: "p2", role: "owner" });
  });

  test("setHouseholdPhoneRole's 409 becomes HouseholdPhonesError('last_owner') -- self-lockout prevention surfaced to the UI", async () => {
    respond(409);
    await expect(setHouseholdPhoneRole("p2", "adult")).rejects.toMatchObject({ reason: "last_owner" });
  });

  test("revokeHouseholdPhone's 409 becomes HouseholdPhonesError('last_owner')", async () => {
    respond(409);
    await expect(revokeHouseholdPhone("p2")).rejects.toBeInstanceOf(HouseholdPhonesError);
    respond(409);
    await expect(revokeHouseholdPhone("p2")).rejects.toMatchObject({ reason: "last_owner" });
  });

  test("a 404 becomes HouseholdPhonesError('not_found')", async () => {
    respond(404);
    await expect(revokeHouseholdPhone("no-such-id")).rejects.toMatchObject({ reason: "not_found" });
  });

  test("an unexpected status becomes HouseholdPhonesError('unknown')", async () => {
    respond(500);
    await expect(revokeHouseholdPhone("p2")).rejects.toMatchObject({ reason: "unknown" });
  });

  test("renameHouseholdPhone sends {id, phoneName}", async () => {
    respond(200, { ok: true });
    await renameHouseholdPhone("p2", "Leah's new phone");
    const [, , init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ id: "p2", phoneName: "Leah's new phone" });
  });
});
