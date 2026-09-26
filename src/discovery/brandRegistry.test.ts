import { createHearthRuntime } from "../runtime/bootstrap";
import { addPickerBrands, BRAND_REGISTRY, brandForDriverId, brandsForAddress, getBrand, isBrandId, matchBrandByText } from "./brandRegistry";

describe("brand registry consistency", () => {
  const registeredDriverIds = createHearthRuntime().driverRegistry.list().map((driver) => driver.id);

  test("every registered driver has exactly one brand entry", () => {
    for (const driverId of registeredDriverIds) {
      expect(BRAND_REGISTRY.filter((brand) => brand.driverId === driverId)).toHaveLength(1);
    }
  });

  test("every brand entry points at a registered driver", () => {
    for (const brand of BRAND_REGISTRY) expect(registeredDriverIds).toContain(brand.driverId);
  });

  test("brand ids and driver ids are unique", () => {
    expect(new Set(BRAND_REGISTRY.map((b) => b.id)).size).toBe(BRAND_REGISTRY.length);
    expect(new Set(BRAND_REGISTRY.map((b) => b.driverId)).size).toBe(BRAND_REGISTRY.length);
  });

  test("inline-field brands declare help text for each field and other modes declare none", () => {
    for (const brand of BRAND_REGISTRY) {
      if (brand.addMode === "inline-fields") {
        expect(brand.fields.length).toBeGreaterThan(0);
        brand.fields.forEach((field) => expect(field.help.length).toBeGreaterThan(10));
      } else {
        expect(brand.fields).toEqual([]);
      }
    }
  });

  test("Sony asks for a PSK with the TV-menu path in its help", () => {
    const [psk] = getBrand("sony").fields;
    expect(psk.key).toBe("psk");
    expect(psk.help).toMatch(/IP Control/);
  });

  test("brands that need Family Command Center match the drivers that only work through it", () => {
    const needsFcc = BRAND_REGISTRY.filter((b) => b.needsFcc).map((b) => b.id).sort();
    expect(needsFcc).toEqual(["appletv", "broadlink", "chromecast", "lg", "lifx", "ps5", "vizio", "wiz"]);
  });
});

describe("Home Assistant brand", () => {
  test("is an account-style custom-screen brand in the add picker with a plain-language hint", () => {
    const brand = getBrand("homeassistant");
    expect(brand.addMode).toBe("custom-screen");
    expect(brand.needsIp).toBe(false);
    expect(addPickerBrands().map((b) => b.id)).toContain("homeassistant");
    expect(brand.hint).toMatch(/long-lived access token/i);
    expect(brandsForAddress("homeassistant.local", null).map((b) => b.id)).not.toContain("homeassistant");
  });
});

describe("brand lookups", () => {
  test("a PlayStation vendor string is the PS5, not a Sony TV", () => {
    expect(matchBrandByText("PS5-123 Sony Interactive Entertainment")?.id).toBe("ps5");
    expect(matchBrandByText("SonyTV.lan")?.id).toBe("sony");
  });

  test("hostnames of the previously unmatched brands are now recognized", () => {
    expect(matchBrandByText("XboxOne")?.id).toBe("xbox");
    expect(matchBrandByText("Apple TV")?.id).toBe("appletv");
    expect(matchBrandByText("Chromecast-Ultra")?.id).toBe("chromecast");
  });

  test("hostnames of the vizio, wiz, lifx and shelly brands are recognized", () => {
    expect(matchBrandByText("VIZIO-V505-H19")?.id).toBe("vizio");
    expect(matchBrandByText("wiz_1a2b3c")?.id).toBe("wiz");
    expect(matchBrandByText("LIFX Bulb 1A2B3C")?.id).toBe("lifx");
    expect(matchBrandByText("shelly1pm-84CCA8")?.id).toBe("shelly");
    expect(matchBrandByText("ShellyPlus1 Allterco Robotics")?.id).toBe("shelly");
  });

  test("a Wiz bulb whose vendor is Signify is a Wiz, not a Hue", () => {
    expect(matchBrandByText("wiz_1a2b3c Signify Netherlands")?.id).toBe("wiz");
    expect(matchBrandByText("Hue Bridge Signify")?.id).toBe("hue");
  });

  test("the Vizio TV pairs on its own screen and the other new brands need only an address", () => {
    expect(getBrand("vizio").addMode).toBe("custom-screen");
    for (const id of ["wiz", "lifx", "shelly"] as const) expect(getBrand(id).addMode).toBe("ip-only");
  });

  test("an unknown hostname matches nothing", () => {
    expect(matchBrandByText("iRobot-vacuum")).toBeUndefined();
  });

  test("brandsForAddress puts the vendor guess first and leaves out account-only brands", () => {
    const ids = brandsForAddress("LGwebOSTV", null).map((b) => b.id);
    expect(ids[0]).toBe("lg");
    expect(ids).not.toContain("smartthings");
    expect(ids).not.toContain("switchbot");
  });

  test("brandsForAddress keeps registry order when nothing matches", () => {
    expect(brandsForAddress("thing", null)[0].id).toBe("ps5");
  });

  test("lookups by driver id and id validation", () => {
    expect(brandForDriverId(getBrand("roku").driverId)?.id).toBe("roku");
    expect(brandForDriverId("nope")).toBeUndefined();
    expect(isBrandId("hue")).toBe(true);
    expect(isBrandId("toaster")).toBe(false);
  });

  test("the feeder is registered but not offered in the home add picker", () => {
    expect(addPickerBrands().map((b) => b.id)).not.toContain("feeder");
    expect(getBrand("feeder").addMode).toBe("ip-only");
  });
});
