import { buildPrivacyEntries, nothingElseLeaves } from "./privacyDisclosure";

describe("buildPrivacyEntries", () => {
  test("always includes the home-WiFi and log/update entries", () => {
    const texts = buildPrivacyEntries(false, false, false).map((entry) => entry.text);
    expect(texts.some((text) => text.includes("home WiFi"))).toBe(true);
    expect(texts.some((text) => text.includes("redacted"))).toBe(true);
    expect(texts.some((text) => text.includes("EAS Update") || text.includes("Expo's own update servers"))).toBe(true);
  });

  test("mentions the Cloudflare tunnel only when an away address is configured", () => {
    expect(buildPrivacyEntries(true, false, false).some((entry) => entry.text.includes("Cloudflare tunnel"))).toBe(true);
    expect(buildPrivacyEntries(false, false, false).some((entry) => entry.text.includes("Cloudflare tunnel"))).toBe(false);
  });

  test("mentions Home Assistant only when a Home Assistant device is connected", () => {
    expect(buildPrivacyEntries(false, true, false).some((entry) => entry.text.includes("Home Assistant"))).toBe(true);
    expect(buildPrivacyEntries(false, false, false).some((entry) => entry.text.includes("Home Assistant"))).toBe(false);
  });

  test("mentions SwitchBot's cloud API only when a SwitchBot device is connected", () => {
    expect(buildPrivacyEntries(false, false, true).some((entry) => entry.text.includes("api.switch-bot.com"))).toBe(true);
    expect(buildPrivacyEntries(false, false, false).some((entry) => entry.text.includes("api.switch-bot.com"))).toBe(false);
  });
});

describe("nothingElseLeaves", () => {
  test("true when neither Home Assistant nor SwitchBot is connected", () => {
    expect(nothingElseLeaves(false, false)).toBe(true);
  });

  test("false once either integration is connected", () => {
    expect(nothingElseLeaves(true, false)).toBe(false);
    expect(nothingElseLeaves(false, true)).toBe(false);
  });
});
