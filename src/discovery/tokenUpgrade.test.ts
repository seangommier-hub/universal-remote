import { usesLegacySharedToken } from "./tokenUpgrade";
import type { FamilyCommandCenterConfig } from "./familyCommandCenterConfig";

function config(tokenKind: FamilyCommandCenterConfig["tokenKind"]): FamilyCommandCenterConfig {
  return { baseUrl: "http://192.168.1.172:3210", token: "tok", tokenKind };
}

describe("usesLegacySharedToken", () => {
  test("false when nothing is saved yet", () => {
    expect(usesLegacySharedToken(null)).toBe(false);
  });

  test("false once this phone has a personal token", () => {
    expect(usesLegacySharedToken(config("personal"))).toBe(false);
  });

  test("true for an explicit legacy token kind", () => {
    expect(usesLegacySharedToken(config("legacy"))).toBe(true);
  });

  test("true for a config saved before tokenKind existed (undefined, not just 'legacy')", () => {
    expect(usesLegacySharedToken(config(undefined))).toBe(true);
  });
});
