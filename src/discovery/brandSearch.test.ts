import { BRAND_REGISTRY } from "./brandRegistry";
import { brandVisual, monogramFor } from "./brandVisuals";
import { editDistance, searchBrands } from "./brandSearch";

const ids = (query: string) => searchBrands(BRAND_REGISTRY, query).map((brand) => brand.id);

describe("searchBrands", () => {
  test("test_empty_query_returns_every_brand_in_registry_order", () => {
    expect(searchBrands(BRAND_REGISTRY, "  ")).toBe(BRAND_REGISTRY);
  });

  test("test_typos_still_find_the_brand", () => {
    expect(ids("sammsung")[0]).toBe("samsung");
    expect(ids("chromcast")[0]).toBe("chromecast");
    expect(ids("phillips")).toContain("hue");
    expect(ids("sonoss")[0]).toBe("sonos");
  });

  test("test_swapped_letters_count_as_one_typo", () => {
    expect(editDistance("smasung", "samsung")).toBe(1);
    expect(ids("smasung")[0]).toBe("samsung");
  });

  test("test_aliases_and_manufacturer_match", () => {
    expect(ids("webos")[0]).toBe("lg");
    expect(ids("bravia")[0]).toBe("sony");
    expect(ids("playstation")[0]).toBe("ps5");
    expect(ids("microsoft")).toContain("xbox");
  });

  test("test_prefix_of_a_word_matches_while_typing", () => {
    expect(ids("sam")[0]).toBe("samsung");
    expect(ids("apple")[0]).toBe("appletv");
  });

  test("test_gibberish_matches_nothing", () => {
    expect(ids("zzqxv")).toEqual([]);
  });

  test("test_a_two_letter_query_only_matches_literally_never_by_typo", () => {
    expect(ids("lx")).toEqual([]);
  });
});

describe("brandVisual", () => {
  test("test_monogram_is_two_letters_of_a_single_word_or_initials", () => {
    expect(monogramFor("PS5")).toBe("PS");
    expect(monogramFor("Samsung TV")).toBe("ST");
    expect(monogramFor("Roku")).toBe("RO");
    expect(monogramFor("")).toBe("?");
  });

  test("test_known_brand_has_its_own_color_and_a_new_brand_gets_a_stable_fallback", () => {
    expect(brandVisual({ id: "lg", label: "LG TV" }).color).toBe("#E5334B");
    const first = brandVisual({ id: "newbrand", label: "New Brand" });
    expect(brandVisual({ id: "newbrand", label: "New Brand" })).toEqual(first);
    expect(first.tint.startsWith(first.color)).toBe(true);
  });
});
