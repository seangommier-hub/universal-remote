import { ActivityLogEntry } from "./activityLogEntry";
import { activityToggleLabel, COLLAPSED_ACTIVITY_COUNT, visibleActivityEntries } from "./visibleActivity";

function entries(count: number): ActivityLogEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `e${index}`,
    deviceId: "tv",
    deviceName: "Den TV",
    verb: "turned on",
    ok: true,
    at: "2026-10-05T21:00:00.000Z",
    who: "Sean",
  }));
}

describe("visibleActivityEntries", () => {
  test("collapsed shows only the newest few, in order", () => {
    const shown = visibleActivityEntries(entries(50), false);
    expect(shown).toHaveLength(COLLAPSED_ACTIVITY_COUNT);
    expect(shown[0].id).toBe("e0");
  });

  test("expanded shows every entry, so nothing is dropped", () => {
    expect(visibleActivityEntries(entries(50), true)).toHaveLength(50);
  });

  test("a short list is shown whole either way", () => {
    expect(visibleActivityEntries(entries(3), false)).toHaveLength(3);
  });
});

describe("activityToggleLabel", () => {
  test("offers Show all with the total when entries are hidden", () => {
    expect(activityToggleLabel(50, false)).toBe("Show all 50");
  });

  test("offers Show fewer when expanded", () => {
    expect(activityToggleLabel(50, true)).toBe("Show fewer");
  });

  test("no toggle when everything already fits", () => {
    expect(activityToggleLabel(COLLAPSED_ACTIVITY_COUNT, false)).toBeNull();
  });
});
