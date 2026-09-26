import { ActivityLocalState, deleteLocalActivity, emptyLocalState, saveLocalActivity } from "../core/activities/activityLocalState";
import { Activity } from "../core/types/Activity";
import { FccUnreachableError } from "../core/network/fccErrors";
import { ActivitiesClient, ActivitiesUnsupportedError } from "../discovery/familyCommandCenterActivities";
import { syncActivities } from "./activitySync";

const NOW = "2026-09-26T12:00:00.000Z";

function activity(id: string, version: number, name = id): Activity {
  return { id, name, steps: [{ kind: "delay", ms: 1000 }], version, updatedAt: NOW };
}

function fakeClient(serverActivities: Activity[], overrides: Partial<ActivitiesClient> = {}): ActivitiesClient {
  return {
    fetchSnapshot: jest.fn(async () => ({ activities: serverActivities, triggers: [], updatedAt: NOW })),
    putActivity: jest.fn(async (a: Activity, base: number) => ({ kind: "saved" as const, activity: { ...a, version: base + 1 } })),
    deleteActivity: jest.fn(async () => undefined),
    putTrigger: jest.fn(async () => undefined),
    deleteTrigger: jest.fn(async () => undefined),
    postRun: jest.fn(async () => undefined),
    fetchRuns: jest.fn(async () => []),
    ...overrides,
  };
}

function stateWith(activities: Activity[], dirtyIds: string[] = [], pendingDeleteIds: string[] = []): ActivityLocalState {
  return { ...emptyLocalState(), activities, dirtyIds, pendingDeleteIds };
}

describe("syncActivities merge", () => {
  test("takes activities the household has that this phone lacks", async () => {
    const report = await syncActivities(emptyLocalState(), fakeClient([activity("a", 2)]), NOW);
    expect(report.state.activities).toEqual([activity("a", 2)]);
  });

  test("an unedited local copy is replaced by a newer server version", async () => {
    const report = await syncActivities(stateWith([activity("a", 1, "old")]), fakeClient([activity("a", 3, "new")]), NOW);
    expect(report.state.activities[0]).toMatchObject({ name: "new", version: 3 });
  });

  test("a local edit is uploaded with its base version and adopts the returned version", async () => {
    const client = fakeClient([activity("a", 2)]);
    const edited = activity("a", 2, "edited");
    const report = await syncActivities(stateWith([edited], ["a"]), client, NOW);
    expect(client.putActivity).toHaveBeenCalledWith(edited, 2);
    expect(report.state.activities[0]).toMatchObject({ name: "edited", version: 3 });
    expect(report.state.dirtyIds).toEqual([]);
    expect(report.conflicts).toEqual([]);
  });

  test("a new local activity the Pi has never seen is uploaded with base version 0", async () => {
    const client = fakeClient([]);
    const report = await syncActivities(stateWith([activity("new", 0)], ["new"]), client, NOW);
    expect(client.putActivity).toHaveBeenCalledWith(expect.objectContaining({ id: "new" }), 0);
    expect(report.state.activities[0].version).toBe(1);
  });

  test("a synced activity that vanished from the Pi (deleted elsewhere) is dropped locally", async () => {
    const report = await syncActivities(stateWith([activity("gone", 4)]), fakeClient([]), NOW);
    expect(report.state.activities).toEqual([]);
  });

  test("copies syncing a triggers list from the server", async () => {
    const trigger = { id: "t", activityId: "a", kind: "time" as const, at: "21:00", days: [1], enabled: true };
    const client = fakeClient([], { fetchSnapshot: jest.fn(async () => ({ activities: [], triggers: [trigger], updatedAt: NOW })) });
    expect((await syncActivities(emptyLocalState(), client, NOW)).state.triggers).toEqual([trigger]);
  });
});

describe("syncActivities conflicts", () => {
  test("a 409 keeps the server copy, clears the edit, and reports the activity name", async () => {
    const serverCopy = activity("a", 5, "Changed by Leah");
    const client = fakeClient([serverCopy], { putActivity: jest.fn(async () => ({ kind: "conflict" as const, server: serverCopy })) });
    const report = await syncActivities(stateWith([activity("a", 4, "My edit")], ["a"]), client, NOW);
    expect(report.state.activities[0]).toMatchObject({ name: "Changed by Leah", version: 5 });
    expect(report.state.dirtyIds).toEqual([]);
    expect(report.conflicts).toEqual(["My edit"]);
  });

  test("a failed upload keeps the local edit dirty for the next sync", async () => {
    const client = fakeClient([activity("a", 1)], { putActivity: jest.fn(async () => { throw new FccUnreachableError("down"); }) });
    const report = await syncActivities(stateWith([activity("a", 1, "edit")], ["a"]), client, NOW);
    expect(report.state.activities[0].name).toBe("edit");
    expect(report.state.dirtyIds).toEqual(["a"]);
  });
});

describe("syncActivities deletes", () => {
  test("a pending delete is sent to the Pi and not resurrected from the snapshot", async () => {
    const client = fakeClient([activity("a", 2)]);
    const report = await syncActivities(stateWith([], [], ["a"]), client, NOW);
    expect(client.deleteActivity).toHaveBeenCalledWith("a");
    expect(report.state.activities).toEqual([]);
    expect(report.state.pendingDeleteIds).toEqual([]);
  });

  test("a delete that fails stays pending and the activity stays hidden", async () => {
    const client = fakeClient([activity("a", 2)], { deleteActivity: jest.fn(async () => { throw new Error("500"); }) });
    const report = await syncActivities(stateWith([], [], ["a"]), client, NOW);
    expect(report.state.pendingDeleteIds).toEqual(["a"]);
    expect(report.state.activities).toEqual([]);
  });
});

describe("syncActivities local-only fallback", () => {
  test("an unreachable Pi leaves local state untouched and classifies the failure", async () => {
    const local = stateWith([activity("a", 0)], ["a"]);
    const client = fakeClient([], { fetchSnapshot: jest.fn(async () => { throw new FccUnreachableError("no route"); }) });
    const report = await syncActivities(local, client, NOW);
    expect(report).toMatchObject({ reachable: false, supported: true, state: local });
    expect(report.diagnosis?.kind).toBe("lan-blocked");
  });

  test("a Pi without the routes (404) is reported unsupported, not as a network failure", async () => {
    const local = stateWith([activity("a", 0)]);
    const client = fakeClient([], { fetchSnapshot: jest.fn(async () => { throw new ActivitiesUnsupportedError("404"); }) });
    const report = await syncActivities(local, client, NOW);
    expect(report).toMatchObject({ reachable: true, supported: false, state: local });
  });
});

describe("local state edits", () => {
  test("saveLocalActivity stamps who and when, keeps the base version, and marks it dirty", () => {
    const next = saveLocalActivity(stateWith([activity("a", 3)]), activity("a", 3, "renamed"), "Sean", "2026-09-27T00:00:00.000Z");
    expect(next.activities[0]).toMatchObject({ name: "renamed", version: 3, updatedBy: "Sean", updatedAt: "2026-09-27T00:00:00.000Z" });
    expect(next.dirtyIds).toEqual(["a"]);
  });

  test("deleting a synced activity queues a Pi delete; deleting a never-synced one does not", () => {
    expect(deleteLocalActivity(stateWith([activity("a", 2)]), "a").pendingDeleteIds).toEqual(["a"]);
    expect(deleteLocalActivity(stateWith([activity("b", 0)], ["b"]), "b")).toMatchObject({ pendingDeleteIds: [], dirtyIds: [], activities: [] });
  });

  test("re-saving an activity cancels its pending delete", () => {
    const next = saveLocalActivity(stateWith([], [], ["a"]), activity("a", 2), undefined, NOW);
    expect(next.pendingDeleteIds).toEqual([]);
  });
});
