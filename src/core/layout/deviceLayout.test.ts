import { Device } from "../types/Device";
import { buildDeviceListModel, sectionMateIds } from "./deviceGrouping";
import { cleanRoomName, emptyLayout, normalizeLayout, pruneLayout, roomChoices, setDeviceRoom, toggleFavorite, toggleRoomCollapsed } from "./deviceLayout";
import { applyDeviceOrder, moveWithinGroup } from "./deviceOrdering";

function device(id: string): Device {
  return { id, name: id.toUpperCase(), category: "tv", manufacturer: "X", driverId: "d", capabilities: [] };
}
const devices = ["a", "b", "c", "d"].map(device);

describe("normalizeLayout", () => {
  test("missing or junk storage becomes an empty layout", () => {
    expect(normalizeLayout(undefined)).toEqual(emptyLayout());
    expect(normalizeLayout("nope")).toEqual(emptyLayout());
    expect(normalizeLayout(null)).toEqual(emptyLayout());
  });

  test("keeps valid fields and drops damaged ones without losing the rest", () => {
    const layout = normalizeLayout({ rooms: { a: "  Den ", b: 5, c: "" }, favorites: ["a", 3, "a"], order: "bad" });
    expect(layout.rooms).toEqual({ a: "Den" });
    expect(layout.favorites).toEqual(["a"]);
    expect(layout.order).toEqual([]);
    expect(layout.collapsedRooms).toEqual([]);
  });
});

describe("layout edits", () => {
  test("setDeviceRoom cleans the name and an empty name clears the room", () => {
    const set = setDeviceRoom(emptyLayout(), "a", "  Living   Room ");
    expect(set.rooms.a).toBe("Living Room");
    expect(setDeviceRoom(set, "a", "  ").rooms).toEqual({});
  });

  test("cleanRoomName caps the length", () => {
    expect(cleanRoomName("x".repeat(80))).toHaveLength(30);
  });

  test("toggleFavorite adds then removes, keeping star order", () => {
    const one = toggleFavorite(toggleFavorite(emptyLayout(), "b"), "a");
    expect(one.favorites).toEqual(["b", "a"]);
    expect(toggleFavorite(one, "b").favorites).toEqual(["a"]);
  });

  test("toggleRoomCollapsed flips a section", () => {
    const collapsed = toggleRoomCollapsed(emptyLayout(), "den");
    expect(collapsed.collapsedRooms).toEqual(["den"]);
    expect(toggleRoomCollapsed(collapsed, "den").collapsedRooms).toEqual([]);
  });

  test("pruneLayout forgets removed devices", () => {
    const layout = { ...emptyLayout(), rooms: { a: "Den", z: "Den" }, favorites: ["z", "a"], order: ["z", "a"] };
    expect(pruneLayout(layout, ["a"])).toMatchObject({ rooms: { a: "Den" }, favorites: ["a"], order: ["a"] });
  });

  test("roomChoices lists rooms in use first and never repeats a suggestion by case", () => {
    const choices = roomChoices({ ...emptyLayout(), rooms: { a: "den", b: "Guest Room" } });
    expect(choices.slice(0, 2)).toEqual(["den", "Guest Room"]);
    expect(choices.filter((c) => c.toLowerCase() === "den")).toHaveLength(1);
  });
});

describe("applyDeviceOrder", () => {
  test("listed ids come first in saved order, the rest keep their original order", () => {
    expect(applyDeviceOrder(devices, ["c", "a"]).map((d) => d.id)).toEqual(["c", "a", "b", "d"]);
  });

  test("an empty order leaves the list untouched", () => {
    expect(applyDeviceOrder(devices, []).map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("moveWithinGroup", () => {
  test("moving down swaps with the next device of the same group only", () => {
    const next = moveWithinGroup(emptyLayout(), devices, ["a", "c"], "a", "down");
    expect(applyDeviceOrder(devices, next).map((d) => d.id)).toEqual(["c", "b", "a", "d"]);
  });

  test("the first device cannot move up and the order is unchanged", () => {
    expect(moveWithinGroup(emptyLayout(), devices, ["a", "b"], "a", "up")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("buildDeviceListModel", () => {
  test("no rooms set gives one flat untitled section in the original order", () => {
    const model = buildDeviceListModel(devices, emptyLayout());
    expect(model.grouped).toBe(false);
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].devices.map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
    expect(model.favorites).toEqual([]);
  });

  test("rooms group case-insensitively, sort by name, and unassigned devices come last", () => {
    const layout = { ...emptyLayout(), rooms: { a: "Den", b: "den", c: "Bedroom" } };
    const model = buildDeviceListModel(devices, layout);
    expect(model.grouped).toBe(true);
    expect(model.sections.map((s) => s.title)).toEqual(["Bedroom", "Den", "Other devices"]);
    expect(model.sections[1].devices.map((d) => d.id)).toEqual(["a", "b"]);
    expect(model.sections[2].devices.map((d) => d.id)).toEqual(["d"]);
  });

  test("favorites keep their star order, skip removed devices, and stay in their room too", () => {
    const layout = { ...emptyLayout(), rooms: { a: "Den" }, favorites: ["c", "gone", "a"] };
    const model = buildDeviceListModel(devices, layout);
    expect(model.favorites.map((d) => d.id)).toEqual(["c", "a"]);
    expect(model.sections[0].devices.map((d) => d.id)).toContain("a");
  });

  test("collapsed rooms are flagged and sectionMateIds returns the room members in order", () => {
    const layout = { ...emptyLayout(), rooms: { a: "Den", b: "Den" }, collapsedRooms: ["den"], order: ["b"] };
    const model = buildDeviceListModel(devices, layout);
    expect(model.sections[0].collapsed).toBe(true);
    expect(sectionMateIds(model, "a")).toEqual(["b", "a"]);
  });
});
