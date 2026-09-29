import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import {
  createRemotePairingCode,
  fetchHouseholdRemotes,
  fetchRemoteButtonMap,
  HouseholdRemotesError,
  renameHouseholdRemote,
  revokeHouseholdRemote,
  saveRemoteButtonMap,
} from "./householdRemotes";

// ADR-HEARTH-201, Pi adr/0250: same mocking pattern as householdPhones.test.ts -- mocks the shared
// fccFetch client and the saved config, since a real network/AsyncStorage round trip isn't the point.

jest.mock("../core/network/fccRequest", () => ({ fccFetch: jest.fn() }));
jest.mock("./familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

const fetchMock = fccFetch as jest.Mock;
const configMock = loadFamilyCommandCenterConfig as jest.Mock;
const CONFIG = { baseUrl: "http://pi", token: "t" };

function respond(status: number, body: unknown = {}): void {
  fetchMock.mockResolvedValueOnce({ status, ok: status >= 200 && status < 300, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  configMock.mockReset().mockResolvedValue(CONFIG);
});

describe("fetchHouseholdRemotes", () => {
  test("returns the remotes array from the admin list route", async () => {
    respond(200, { remotes: [{ id: "r1", name: "Living room remote" }] });
    await expect(fetchHouseholdRemotes()).resolves.toEqual([{ id: "r1", name: "Living room remote" }]);
    expect(fetchMock.mock.calls[0][1]).toBe("/api/integrations/hearth/physical-remote");
  });

  test("a non-owner phone's 403 becomes HouseholdRemotesError('forbidden')", async () => {
    respond(403);
    await expect(fetchHouseholdRemotes()).rejects.toMatchObject({ reason: "forbidden" });
  });

  test("a malformed body (no remotes array) is treated as an empty list, not a crash", async () => {
    respond(200, {});
    await expect(fetchHouseholdRemotes()).resolves.toEqual([]);
  });

  test("throws plainly when Family Command Center isn't connected at all", async () => {
    configMock.mockResolvedValue(null);
    await expect(fetchHouseholdRemotes()).rejects.toThrow("Family Command Center isn't connected");
  });
});

describe("mutating admin actions map status codes to plain reasons", () => {
  test("renameHouseholdRemote sends {id, name} and resolves on 200", async () => {
    respond(200, { ok: true });
    await expect(renameHouseholdRemote("r1", "Kitchen remote")).resolves.toBeUndefined();
    const [, , init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ id: "r1", name: "Kitchen remote" });
  });

  test("revokeHouseholdRemote sends {id} alone", async () => {
    respond(200, { ok: true });
    await revokeHouseholdRemote("r1");
    const [, , init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ id: "r1" });
  });

  test("a 404 becomes HouseholdRemotesError('not_found')", async () => {
    respond(404);
    await expect(revokeHouseholdRemote("no-such-id")).rejects.toMatchObject({ reason: "not_found" });
    respond(404);
    await expect(revokeHouseholdRemote("no-such-id")).rejects.toBeInstanceOf(HouseholdRemotesError);
  });

  test("an unexpected status becomes HouseholdRemotesError('unknown')", async () => {
    respond(500);
    await expect(revokeHouseholdRemote("r1")).rejects.toMatchObject({ reason: "unknown" });
  });
});

describe("createRemotePairingCode", () => {
  test("POSTs an empty body to the pair route and returns the minted code", async () => {
    respond(200, { code: "N5SSXF3R", expiresAt: "2026-09-29T19:00:00.000Z" });
    await expect(createRemotePairingCode()).resolves.toEqual({ code: "N5SSXF3R", expiresAt: "2026-09-29T19:00:00.000Z" });
    const [, path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/integrations/hearth/physical-remote/pair");
    expect(JSON.parse(init.body)).toEqual({});
  });

  test("a non-owner's 403 becomes HouseholdRemotesError('forbidden')", async () => {
    respond(403);
    await expect(createRemotePairingCode()).rejects.toMatchObject({ reason: "forbidden" });
  });
});

describe("remote button mapping", () => {
  test("fetchRemoteButtonMap reads the map by remoteId query and defaults to an empty object", async () => {
    respond(200, {});
    await expect(fetchRemoteButtonMap("r1")).resolves.toEqual({});
    expect(fetchMock.mock.calls[0][1]).toBe("/api/integrations/hearth/physical-remote/mapping?remoteId=r1");
  });

  test("fetchRemoteButtonMap returns the stored buttons", async () => {
    const buttons = { power: { kind: "command", deviceId: "tv-1", capability: "power" } };
    respond(200, { buttons });
    await expect(fetchRemoteButtonMap("r1")).resolves.toEqual(buttons);
  });

  test("saveRemoteButtonMap PUTs {remoteId, buttons}", async () => {
    respond(200, { ok: true });
    const buttons = { movie: { kind: "activity" as const, activityId: "movie-night" } };
    await saveRemoteButtonMap("r1", buttons);
    const [, path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/integrations/hearth/physical-remote/mapping");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ remoteId: "r1", buttons });
  });

  test("a 422 (store cap reached) becomes HouseholdRemotesError('limit_reached')", async () => {
    respond(422);
    await expect(saveRemoteButtonMap("r1", {})).rejects.toMatchObject({ reason: "limit_reached" });
  });
});
