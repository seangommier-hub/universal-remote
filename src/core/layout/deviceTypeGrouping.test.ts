import { Device, DeviceCategory } from "../types/Device";
import { buildDeviceListModel, sectionMateIds } from "./deviceGrouping";
import { DeviceLayout, emptyLayout, normalizeLayout, pruneLayout, setGroupBy, toggleTypeCollapsed } from "./deviceLayout";
import { moveWithinGroup } from "./deviceOrdering";
import { GROUP_BY_CATEGORY } from "./deviceTypeGroups";

function device(id: string, category: DeviceCategory): Device {
  return { id, name: id, category, manufacturer: "X", driverId: "d", capabilities: [] };
}

const household: Device[] = [
  device("garage", "cover"),
  device("plug", "outlet"),
  device("lg", "tv"),
  device("roku", "streaming"),
  device("cam", "camera"),
  device("sonos", "audio"),
  device("hub", "other"),
  device("lamp", "lighting"),
];

const titles = (layout: DeviceLayout, devices: readonly Device[] = household) => buildDeviceListModel(devices, layout).sections.map((s) => s.title);

describe("type mode", () => {
  test("a fresh layout defaults to type mode and groups in the fixed order with TVs first", () => {
    expect(emptyLayout().groupBy).toBe("type");
    expect(titles(emptyLayout())).toEqual(["TVs & Streaming", "Audio", "Lights", "Plugs & Outlets", "Cameras", "Covers & Locks", "Other"]);
  });

  test("tv and streaming share one section, in the original order", () => {
    const section = buildDeviceListModel(household, emptyLayout()).sections[0];
    expect(section.devices.map((d) => d.id)).toEqual(["lg", "roku"]);
  });

  test("empty sections are hidden", () => {
    expect(titles(emptyLayout(), [device("a", "tv")])).toEqual(["TVs & Streaming"]);
    expect(buildDeviceListModel([], emptyLayout()).sections).toEqual([]);
  });

  test("every device shows up exactly once whatever its category", () => {
    const everything = (Object.keys(GROUP_BY_CATEGORY) as DeviceCategory[]).map((category) => device(`d-${category}`, category));
    const shown = buildDeviceListModel(everything, emptyLayout()).sections.flatMap((s) => s.devices.map((d) => d.id));
    expect(shown.sort()).toEqual(everything.map((d) => d.id).sort());
  });

  test("an unknown category still appears, under Other", () => {
    const model = buildDeviceListModel([device("x", "teleporter" as DeviceCategory)], emptyLayout());
    expect(model.sections.map((s) => s.title)).toEqual(["Other"]);
  });

  test("ordering applies within a section only", () => {
    const layout = { ...emptyLayout(), order: ["roku", "lg"] };
    const model = buildDeviceListModel(household, layout);
    expect(model.sections[0].devices.map((d) => d.id)).toEqual(["roku", "lg"]);
    expect(model.sections[1].devices.map((d) => d.id)).toEqual(["sonos"]);
  });

  test("moving down swaps with the next device in the same type section", () => {
    const mates = sectionMateIds(buildDeviceListModel(household, emptyLayout()), "lg");
    expect(mates).toEqual(["lg", "roku"]);
    const next = moveWithinGroup(emptyLayout(), household, mates, "lg", "down");
    expect(buildDeviceListModel(household, { ...emptyLayout(), order: next }).sections[0].devices.map((d) => d.id)).toEqual(["roku", "lg"]);
  });

  test("favorites stay a separate row and the device also stays in its type section", () => {
    const model = buildDeviceListModel(household, { ...emptyLayout(), favorites: ["cam", "gone", "lg"] });
    expect(model.favorites.map((d) => d.id)).toEqual(["cam", "lg"]);
    expect(model.sections.flatMap((s) => s.devices.map((d) => d.id))).toContain("cam");
  });

  test("collapsed sections are flagged and the model reports its mode", () => {
    const model = buildDeviceListModel(household, toggleTypeCollapsed(emptyLayout(), "audio"));
    expect(model.mode).toBe("type");
    expect(model.sections.map((s) => s.collapsed)).toEqual([false, true, false, false, false, false, false]);
  });

  test("room assignments do not change type grouping", () => {
    expect(titles({ ...emptyLayout(), rooms: { lg: "Den" } })).toEqual(titles(emptyLayout()));
  });
});

describe("room mode is preserved", () => {
  test("with rooms set it groups by room exactly as before", () => {
    const layout: DeviceLayout = { ...emptyLayout(), groupBy: "room", rooms: { lg: "Den", sonos: "Den" } };
    const model = buildDeviceListModel(household, layout);
    expect(model.mode).toBe("room");
    expect(model.sections.map((s) => s.title)).toEqual(["Den", "Other devices"]);
  });

  test("with no rooms set it stays one flat list", () => {
    const model = buildDeviceListModel(household, { ...emptyLayout(), groupBy: "room" });
    expect(model.grouped).toBe(false);
    expect(model.sections).toHaveLength(1);
  });
});

describe("group-by and collapse persistence", () => {
  test("toggleTypeCollapsed flips a section and setGroupBy switches the mode", () => {
    const collapsed = toggleTypeCollapsed(emptyLayout(), "cameras");
    expect(collapsed.collapsedTypes).toEqual(["cameras"]);
    expect(toggleTypeCollapsed(collapsed, "cameras").collapsedTypes).toEqual([]);
    expect(setGroupBy(emptyLayout(), "room").groupBy).toBe("room");
  });

  test("a layout saved before ADR-HEARTH-193 loads in type mode with nothing collapsed, keeping its rooms", () => {
    const old = normalizeLayout({ rooms: { a: "Den" }, favorites: ["a"], order: ["b"], collapsedRooms: ["den"], kidAllowed: ["a"] });
    expect(old.groupBy).toBe("type");
    expect(old.collapsedTypes).toEqual([]);
    expect(old.rooms).toEqual({ a: "Den" });
    expect(old.collapsedRooms).toEqual(["den"]);
  });

  test("the saved group-by choice and known collapsed types survive; junk and unknown ids are dropped", () => {
    const layout = normalizeLayout({ groupBy: "room", collapsedTypes: ["audio", "audio", "nonsense", 4] });
    expect(layout.groupBy).toBe("room");
    expect(layout.collapsedTypes).toEqual(["audio"]);
    expect(normalizeLayout({ groupBy: "sideways" }).groupBy).toBe("type");
  });

  test("pruning removed devices keeps the group-by choice and collapsed types", () => {
    const layout = { ...emptyLayout(), groupBy: "room" as const, collapsedTypes: ["audio" as const] };
    expect(pruneLayout(layout, [])).toMatchObject({ groupBy: "room", collapsedTypes: ["audio"] });
  });
});
