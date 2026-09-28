import { readFileSync } from "fs";
import { join } from "path";
import { DeviceCategory } from "../types/Device";
import { DEVICE_TYPE_GROUPS, GROUP_BY_CATEGORY, groupIdForDevice, isDeviceTypeGroupId } from "./deviceTypeGroups";

const DEVICE_TYPE_FILE = join(__dirname, "..", "types", "Device.ts");

/** The category names declared in the DeviceCategory union, read from the source so this test fails the moment one is added without a group. */
function declaredCategories(): string[] {
  const source = readFileSync(DEVICE_TYPE_FILE, "utf8");
  const start = source.indexOf("export type DeviceCategory");
  const end = source.indexOf(";", start);
  const withoutComments = source.slice(start, end).replace(/\/\/[^\n]*/g, "");
  return [...withoutComments.matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
}

describe("category to type-group map", () => {
  test("every category in the DeviceCategory union has an explicit group", () => {
    const declared = declaredCategories();
    expect(declared.length).toBeGreaterThan(10);
    const unmapped = declared.filter((category) => !(category in GROUP_BY_CATEGORY));
    expect(unmapped).toEqual([]);
  });

  test("the map has no stale categories the union no longer declares", () => {
    const declared = new Set(declaredCategories());
    expect(Object.keys(GROUP_BY_CATEGORY).filter((category) => !declared.has(category))).toEqual([]);
  });

  test("every category maps to a group that exists in the section order", () => {
    for (const groupId of Object.values(GROUP_BY_CATEGORY)) expect(isDeviceTypeGroupId(groupId)).toBe(true);
  });

  test("every group is used by at least one category, so no section can never appear", () => {
    const used = new Set(Object.values(GROUP_BY_CATEGORY));
    expect(DEVICE_TYPE_GROUPS.filter((group) => !used.has(group.id))).toEqual([]);
  });

  test("group ids and titles are unique, TVs come first and Other comes last", () => {
    expect(new Set(DEVICE_TYPE_GROUPS.map((g) => g.id)).size).toBe(DEVICE_TYPE_GROUPS.length);
    expect(new Set(DEVICE_TYPE_GROUPS.map((g) => g.title)).size).toBe(DEVICE_TYPE_GROUPS.length);
    expect(DEVICE_TYPE_GROUPS[0].title).toBe("TVs & Streaming");
    expect(DEVICE_TYPE_GROUPS[DEVICE_TYPE_GROUPS.length - 1].id).toBe("other");
  });

  test("the categories named in the request land in the requested groups", () => {
    const expected: Record<string, DeviceCategory[]> = {
      tvStreaming: ["tv", "streaming"],
      audio: ["audio"],
      lights: ["lighting"],
      plugs: ["outlet"],
      cameras: ["camera"],
      gaming: ["gaming"],
      vacuums: ["vacuum"],
      climate: ["climate", "fan"],
      covers: ["cover", "lock"],
      sensors: ["sensor"],
      actions: ["action"],
      other: ["other"],
    };
    for (const [group, categories] of Object.entries(expected)) {
      for (const category of categories) expect(GROUP_BY_CATEGORY[category]).toBe(group);
    }
  });

  test("a category from a newer build falls back to Other instead of vanishing", () => {
    expect(groupIdForDevice({ category: "teleporter" as DeviceCategory })).toBe("other");
  });
});
