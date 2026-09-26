import { Device } from "../core/types/Device";
import { BRAND_REGISTRY, getBrand } from "./brandRegistry";
import { BRAND_SETUP_TABLE, checksForDevice, getBrandSetup, hasPowerOnPath, wakeFailureMessage } from "./brandSetupChecks";

function deviceFor(brandId: Parameters<typeof getBrand>[0], capabilities: Device["capabilities"]): Device {
  const brand = getBrand(brandId);
  return { id: `${brandId}-1`, name: brand.defaultName, category: brand.category, manufacturer: brand.manufacturer, driverId: brand.driverId, capabilities };
}

describe("BRAND_SETUP_TABLE", () => {
  it("has no duplicate brands", () => {
    const brands = BRAND_SETUP_TABLE.map((entry) => entry.brand);
    expect(new Set(brands).size).toBe(brands.length);
  });

  it("only names brands that exist in the brand registry", () => {
    const known = new Set(BRAND_REGISTRY.map((brand) => brand.id));
    BRAND_SETUP_TABLE.forEach((entry) => expect(known.has(entry.brand)).toBe(true));
  });

  it("gives every brand a wake failure hint and at least one check", () => {
    BRAND_SETUP_TABLE.forEach((entry) => {
      expect(entry.wakeFailureHint.length).toBeGreaterThan(10);
      expect(entry.checks.length).toBeGreaterThan(0);
    });
  });

  it("gives every check an id, title, why and where text", () => {
    BRAND_SETUP_TABLE.flatMap((entry) => entry.checks).forEach((check) => {
      expect(check.id).toBeTruthy();
      expect(check.title).toBeTruthy();
      expect(check.why).toBeTruthy();
      expect(check.where).toBeTruthy();
    });
  });

  it("has unique check ids within a brand", () => {
    BRAND_SETUP_TABLE.forEach((entry) => {
      const ids = entry.checks.map((check) => check.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it("lists the LG gotchas from the reliability research", () => {
    const ids = getBrandSetup(deviceFor("lg", ["powerOn"]))?.checks.map((check) => check.id) ?? [];
    expect(ids).toEqual(expect.arrayContaining(["lg-quick-start", "lg-tv-on-with-mobile", "lg-allow-prompt", "lg-same-vlan", "mac-known"]));
  });
});

describe("checksForDevice", () => {
  it("returns nothing for a device with no power-on path", () => {
    expect(checksForDevice(deviceFor("lg", ["volumeUp"]), "ios")).toEqual([]);
  });

  it("returns nothing for a brand without wake guidance", () => {
    expect(checksForDevice(deviceFor("sonos", ["power"]), "ios")).toEqual([]);
  });

  it("includes the iOS Local Network check only on iOS", () => {
    const device = deviceFor("samsung", ["power"]);
    expect(checksForDevice(device, "ios").some((check) => check.id === "ios-local-network")).toBe(true);
    expect(checksForDevice(device, "android").some((check) => check.id === "ios-local-network")).toBe(false);
  });
});

describe("hasPowerOnPath and wakeFailureMessage", () => {
  it("accepts powerOn or power", () => {
    expect(hasPowerOnPath(deviceFor("xbox", ["powerOn"]))).toBe(true);
    expect(hasPowerOnPath(deviceFor("sony", ["power"]))).toBe(true);
    expect(hasPowerOnPath(deviceFor("roku", ["powerOff"]))).toBe(false);
  });

  it("names the brand's likely cause on failure", () => {
    expect(wakeFailureMessage(deviceFor("lg", ["powerOn"]))).toMatch(/Quick Start\+/);
    expect(wakeFailureMessage(deviceFor("samsung", ["power"]))).toMatch(/Power on with Mobile/);
  });

  it("falls back to a neutral hint for an unknown brand", () => {
    expect(wakeFailureMessage(deviceFor("sonos", ["power"]))).toMatch(/never answered/);
  });
});
