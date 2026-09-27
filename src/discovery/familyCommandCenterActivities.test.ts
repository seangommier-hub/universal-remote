import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { ActivitiesUnsupportedError, familyCommandCenterActivitiesClient as client } from "./familyCommandCenterActivities";
import { FccNotConfiguredError, FccTokenRejectedError } from "../core/network/fccErrors";
import { Activity } from "../core/types/Activity";

jest.mock("../core/network/fccRequest", () => ({ fccFetch: jest.fn() }));
jest.mock("./familyCommandCenterConfig", () => ({ loadFamilyCommandCenterConfig: jest.fn() }));

const fetchMock = fccFetch as jest.Mock;
const configMock = loadFamilyCommandCenterConfig as jest.Mock;
const CONFIG = { baseUrl: "http://pi", token: "t" };
const ACTIVITY: Activity = { id: "a b", name: "Movie Night", steps: [], version: 2, updatedAt: "2026-09-26T00:00:00.000Z" };

function respond(status: number, body: unknown = {}): void {
  fetchMock.mockResolvedValueOnce({ status, ok: status >= 200 && status < 300, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  configMock.mockReset().mockResolvedValue(CONFIG);
});

test("fetchSnapshot returns activities and triggers from the activities route", async () => {
  respond(200, { activities: [ACTIVITY], triggers: [], updatedAt: "x" });
  const snapshot = await client.fetchSnapshot();
  expect(snapshot.activities).toEqual([ACTIVITY]);
  expect(fetchMock.mock.calls[0][1]).toBe("/api/integrations/hearth/activities");
});

test("a 404 becomes ActivitiesUnsupportedError so callers can stay local-only", async () => {
  respond(404);
  await expect(client.fetchSnapshot()).rejects.toBeInstanceOf(ActivitiesUnsupportedError);
});

test("a 401 becomes FccTokenRejectedError", async () => {
  respond(401);
  await expect(client.fetchSnapshot()).rejects.toBeInstanceOf(FccTokenRejectedError);
});

test("no saved config becomes FccNotConfiguredError", async () => {
  configMock.mockResolvedValue(null);
  await expect(client.fetchSnapshot()).rejects.toBeInstanceOf(FccNotConfiguredError);
});

test("putActivity sends the body with baseVersion to an encoded id path", async () => {
  respond(200, { ...ACTIVITY, version: 3 });
  const outcome = await client.putActivity(ACTIVITY, 2);
  const [, path, init] = fetchMock.mock.calls[0];
  expect(path).toBe("/api/integrations/hearth/activities/a%20b");
  expect(init.method).toBe("PUT");
  const body = JSON.parse(init.body);
  expect(body).toMatchObject({ baseVersion: 2, name: ACTIVITY.name });
  expect(Object.keys(body)).not.toEqual(expect.arrayContaining(["id"]));
  expect(body).not.toHaveProperty("version");
  expect(body).not.toHaveProperty("updatedAt");
  expect(outcome).toEqual({ kind: "saved", activity: { ...ACTIVITY, version: 3 } });
});

test("putActivity turns a 409 into a conflict carrying the current server copy", async () => {
  respond(409, { activity: { ...ACTIVITY, version: 9 } });
  expect(await client.putActivity(ACTIVITY, 2)).toEqual({ kind: "conflict", server: { ...ACTIVITY, version: 9 } });
});

test("putActivity accepts a bare activity as the 409 body too", async () => {
  respond(409, { ...ACTIVITY, version: 7 });
  expect(await client.putActivity(ACTIVITY, 2)).toMatchObject({ kind: "conflict", server: { version: 7 } });
});

test("deleteActivity, trigger routes and run posting hit their contract paths and methods", async () => {
  respond(200);
  respond(200);
  respond(200);
  respond(200);
  await client.deleteActivity("a");
  await client.putTrigger({ id: "t1", activityId: "a", kind: "time", at: "21:00", days: [0], enabled: true });
  await client.deleteTrigger("t1");
  await client.postRun({ runId: "r", activityId: "a", activityName: "A", startedAt: "s", finishedAt: "f", by: "Leah", steps: [] });
  expect(fetchMock.mock.calls.map((c) => [c[2].method, c[1]])).toEqual([
    ["DELETE", "/api/integrations/hearth/activities/a"],
    ["PUT", "/api/integrations/hearth/triggers/t1"],
    ["DELETE", "/api/integrations/hearth/triggers/t1"],
    ["POST", "/api/integrations/hearth/activity-runs"],
  ]);
});

test("fetchRuns asks for the limit and returns the runs list", async () => {
  respond(200, { runs: [{ runId: "r" }] });
  expect(await client.fetchRuns(5)).toEqual([{ runId: "r" }]);
  expect(fetchMock.mock.calls[0][1]).toBe("/api/integrations/hearth/activity-runs?limit=5");
});
