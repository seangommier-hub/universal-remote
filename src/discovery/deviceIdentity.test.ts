import { cleanHostname, cleanReportedName, resolveDisplayName } from "./deviceIdentity";

describe("cleanHostname", () => {
  const cases: Array<[string, string | null]> = [
    ["LGwebOSTV", "LG TV"],
    ["LGwebOSTV.lan", "LG TV"],
    ["Roku-Ultra-XX", "Roku Ultra"],
    ["Roku-Ultra-1A2B3C", "Roku Ultra"],
    ["Google-Nest-Mini-abcdef", "Google Nest Mini"],
    ["ESP_1A2B3C", "ESP device"],
    ["iPhone", "iPhone"],
    ["Sean_s_iPad.localdomain", "Sean s iPad"],
    ["Living-Room-TV.home", "Living Room TV"],
    ["Samsung-TV", "Samsung TV"],
    ["android-9f8e7d6c5b4a3210", "Android device"],
    ["192.168.1.40", null],
    ["", null],
    ["A1B2C3", null],
  ];
  test.each(cases)("%s -> %s", (input, expected) => {
    expect(cleanHostname(input)).toBe(expected);
  });

  test("keeps a real trailing number that is not a hex serial", () => {
    expect(cleanHostname("Bedroom-TV-2")).toBe("Bedroom TV 2");
  });

  test("returns null for null and undefined", () => {
    expect(cleanHostname(null)).toBeNull();
    expect(cleanHostname(undefined)).toBeNull();
  });
});

describe("cleanReportedName", () => {
  const cases: Array<[string, string]> = [
    ["[LG] webOS TV OLED55C1", "LG webOS TV OLED55C1"],
    ["[TV] Samsung 7 Series (55)", "Samsung 7 Series (55)"],
    ["[LG] LG webOS TV", "LG webOS TV"],
    ["Living Room Roku", "Living Room Roku"],
    ["  Kitchen   Sonos ", "Kitchen Sonos"],
  ];
  test.each(cases)("%s -> %s", (input, expected) => {
    expect(cleanReportedName(input)).toBe(expected);
  });
});

describe("resolveDisplayName precedence", () => {
  const everything = {
    userTyped: "Dad's TV",
    reported: "Living Room Roku",
    friendly: "[TV] Samsung 7 Series (55)",
    hostname: "LGwebOSTV.lan",
    vendor: "Sony",
    model: "Bravia XR-55",
    brandLabel: "Roku",
  };

  test("a name typed in Hearth wins over everything", () => {
    expect(resolveDisplayName(everything)).toEqual({ name: "Dad's TV", source: "user" });
  });

  test("then the name the device reports about itself", () => {
    expect(resolveDisplayName({ ...everything, userTyped: "  " })).toEqual({ name: "Living Room Roku", source: "device" });
  });

  test("then the UPnP / mDNS friendly name, tidied", () => {
    expect(resolveDisplayName({ ...everything, userTyped: null, reported: null })).toEqual({ name: "Samsung 7 Series (55)", source: "friendly" });
  });

  test("then the cleaned router hostname", () => {
    expect(resolveDisplayName({ ...everything, userTyped: null, reported: null, friendly: null })).toEqual({ name: "LG TV", source: "hostname" });
  });

  test("then vendor and model without repeating the vendor", () => {
    const rest = { vendor: "Sony", model: "Bravia XR-55", brandLabel: "Sony TV" };
    expect(resolveDisplayName({ ...rest, hostname: "192.168.1.9" })).toEqual({ name: "Sony Bravia XR-55", source: "vendor-model" });
    expect(resolveDisplayName({ vendor: "LG", model: "LG OLED55C1" })).toEqual({ name: "LG OLED55C1", source: "vendor-model" });
  });

  test("then the brand label, then Unknown device", () => {
    expect(resolveDisplayName({ brandLabel: "Roku" })).toEqual({ name: "Roku", source: "brand" });
    expect(resolveDisplayName({})).toEqual({ name: "Unknown device", source: "unknown" });
  });

  test("a junk hostname falls through instead of becoming the name", () => {
    expect(resolveDisplayName({ hostname: "ESP_1A2B3C", brandLabel: "Kasa" }).name).toBe("ESP device");
    expect(resolveDisplayName({ hostname: "10.0.0.5", brandLabel: "Kasa" }).name).toBe("Kasa");
  });
});
