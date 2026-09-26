import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadActivityState, saveActivityState } from "./activityPersistence";
import { emptyLocalState } from "../core/activities/activityLocalState";

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const NOW = "2026-09-26T12:00:00.000Z";
const LEGACY_SCENES = JSON.stringify([
  { id: "s1", name: "Movie Night", actions: [{ deviceId: "tv", capability: "powerOn" }, { deviceId: "tv", capability: "inputSelection", args: { input: "hdmi1" } }] },
]);

function storage(items: Record<string, string>): void {
  getItem.mockImplementation(async (key: string) => items[key] ?? null);
}

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset().mockResolvedValue(undefined);
});

test("first load migrates saved scenes to activities, marks them for upload, and keeps the old key", async () => {
  storage({ "hearth.scenes": LEGACY_SCENES });
  const state = await loadActivityState(NOW);
  expect(state.activities).toHaveLength(1);
  expect(state.activities[0].steps).toEqual([
    { kind: "command", deviceId: "tv", capability: "powerOn" },
    { kind: "command", deviceId: "tv", capability: "inputSelection", args: { input: "hdmi1" } },
  ]);
  expect(state.dirtyIds).toEqual(["s1"]);
  expect(setItem).toHaveBeenCalledWith("hearth.activities.v1", expect.any(String));
  expect(setItem).not.toHaveBeenCalledWith("hearth.scenes", expect.anything());
});

test("once migrated, the new key wins and legacy scenes are not re-imported", async () => {
  storage({ "hearth.scenes": LEGACY_SCENES, "hearth.activities.v1": JSON.stringify({ ...emptyLocalState(), pendingDeleteIds: ["x"] }) });
  const state = await loadActivityState(NOW);
  expect(state.activities).toEqual([]);
  expect(state.pendingDeleteIds).toEqual(["x"]);
});

test("nothing saved at all loads as empty without writing", async () => {
  storage({});
  expect(await loadActivityState(NOW)).toEqual(emptyLocalState());
  expect(setItem).not.toHaveBeenCalled();
});

test("corrupt saved data falls back to an empty state rather than throwing", async () => {
  storage({ "hearth.activities.v1": "{not json", "hearth.scenes": "also bad" });
  expect(await loadActivityState(NOW)).toEqual(emptyLocalState());
});

test("saved state round-trips through storage", async () => {
  const state = { ...emptyLocalState(), activities: [{ id: "a", name: "A", steps: [{ kind: "delay" as const, ms: 5 }], version: 2, updatedAt: NOW }], dirtyIds: ["a"] };
  await saveActivityState(state);
  storage({ "hearth.activities.v1": setItem.mock.calls[0][1] });
  expect(await loadActivityState(NOW)).toEqual(state);
});
