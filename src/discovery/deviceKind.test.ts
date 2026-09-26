import { candidateRank, groupOfKind, guessDeviceKind, isDeviceKind, kindForCategory } from "./deviceKind";

const guess = (hostname: string | null, vendor: string | null = null) => guessDeviceKind({ hostname, vendor, friendlyName: null, model: null });

describe("guessDeviceKind", () => {
  test.each([
    ["Ring-Doorbell-Pro", null, "camera"],
    ["echo-dot-3", "Espressif Inc.", "audio"],
    ["Seans-iPhone", null, "phone"],
    ["voip-desk", "Polycom", "phone"],
    ["Seans-MacBook-Pro", "Apple", "computer"],
    ["HP-LaserJet-M404", null, "printer"],
    ["router", "Netgear", "network"],
    ["LGwebOSTV", null, "tv"],
    ["Roku Ultra", null, "streaming"],
    ["Xbox", null, "console"],
    [null, "Espressif Inc.", "iot"],
    [null, null, "unknown"],
    ["mystery-box", null, "unknown"],
  ])("%s / %s is %s", (hostname, vendor, expected) => {
    expect(guess(hostname, vendor)).toBe(expected);
  });
});

describe("kind helpers", () => {
  test("isDeviceKind guards untrusted values", () => {
    expect(isDeviceKind("camera")).toBe(true);
    expect(isDeviceKind("toaster")).toBe(false);
    expect(isDeviceKind(null)).toBe(false);
  });

  test("category maps to a kind only where one exists", () => {
    expect(kindForCategory("gaming")).toBe("console");
    expect(kindForCategory("vacuum")).toBeNull();
  });

  test("groups follow the spec and remote-controllable kinds rank ahead of noise", () => {
    expect(groupOfKind("tv")).toBe("media");
    expect(groupOfKind("printer")).toBe("other");
    expect(groupOfKind("network")).toBe("network");
    expect(candidateRank("tv")).toBeLessThan(candidateRank("camera"));
    expect(candidateRank("unknown")).toBeLessThan(candidateRank("network"));
  });
});
