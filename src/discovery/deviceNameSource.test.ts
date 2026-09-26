import { parseNameSources, suggestDeviceName } from "./deviceNameSource";

describe("suggestDeviceName", () => {
  test("suggests the device's name when it changed and the person never renamed it", () => {
    expect(suggestDeviceName("Roku", "Living Room Roku", "device")).toBe("Living Room Roku");
    expect(suggestDeviceName("LG TV", "[LG] webOS TV OLED55C1", "hostname")).toBe("LG webOS TV OLED55C1");
  });

  test("never suggests over a name typed in Hearth", () => {
    expect(suggestDeviceName("Dad's TV", "Living Room", "user")).toBeNull();
  });

  test("stays quiet for devices with no recorded source (older saves)", () => {
    expect(suggestDeviceName("Roku", "Living Room Roku", undefined)).toBeNull();
  });

  test("stays quiet when the names already match or the device reports none", () => {
    expect(suggestDeviceName("living room roku", "Living Room Roku", "device")).toBeNull();
    expect(suggestDeviceName("Roku", "  ", "device")).toBeNull();
    expect(suggestDeviceName("Roku", null, "device")).toBeNull();
  });
});

describe("parseNameSources", () => {
  test("keeps string values and drops garbage", () => {
    expect(parseNameSources(JSON.stringify({ a: "user", b: 3 }))).toEqual({ a: "user" });
    expect(parseNameSources("not json")).toEqual({});
    expect(parseNameSources(null)).toEqual({});
    expect(parseNameSources("[1]")).toEqual({});
  });
});
