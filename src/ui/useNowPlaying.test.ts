import { resolveTitle } from "./useNowPlaying";

// Pure-function tests, same pattern as useSwipeBackGesture.test.ts — the hook itself (device
// selection + live subscriptions) isn't independently testable without React rendering infra this
// project doesn't otherwise use for hooks; resolveTitle is the one piece of real logic worth
// covering directly.
describe("resolveTitle", () => {
  test("prefers the driver's own live active-app name when present (Roku, ADR-HEARTH-093)", () => {
    expect(resolveTitle({ activeAppName: "Netflix", lastLaunchedAppId: "12", apps: [{ id: "12", name: "Hulu" }] })).toBe("Netflix");
  });

  test("falls back to resolving lastLaunchedAppId against the apps catalog", () => {
    expect(resolveTitle({ lastLaunchedAppId: "12", apps: [{ id: "12", name: "Netflix" }] })).toBe("Netflix");
  });

  test("falls back to a generic label when neither is available", () => {
    expect(resolveTitle({})).toBe("Now Playing");
  });

  test("falls back to a generic label when lastLaunchedAppId doesn't match anything in the catalog", () => {
    expect(resolveTitle({ lastLaunchedAppId: "99", apps: [{ id: "12", name: "Netflix" }] })).toBe("Now Playing");
  });

  test("ignores a blank activeAppName rather than showing empty text", () => {
    expect(resolveTitle({ activeAppName: "   ", lastLaunchedAppId: "12", apps: [{ id: "12", name: "Netflix" }] })).toBe("Netflix");
  });
});
