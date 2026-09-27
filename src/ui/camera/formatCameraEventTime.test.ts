import { formatCameraEventTime } from "./formatCameraEventTime";

const NOW = Date.parse("2026-01-01T12:00:00.000Z");

describe("formatCameraEventTime", () => {
  test("returns null for a missing timestamp", () => {
    expect(formatCameraEventTime(null, NOW)).toBeNull();
  });

  test("returns null for an unparseable timestamp", () => {
    expect(formatCameraEventTime("not-a-date", NOW)).toBeNull();
  });

  test('"just now" for under a minute', () => {
    expect(formatCameraEventTime(new Date(NOW - 30_000).toISOString(), NOW)).toBe("just now");
  });

  test("minutes ago", () => {
    expect(formatCameraEventTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5m ago");
  });

  test("hours ago", () => {
    expect(formatCameraEventTime(new Date(NOW - 3 * 60 * 60_000).toISOString(), NOW)).toBe("3h ago");
  });

  test("days ago", () => {
    expect(formatCameraEventTime(new Date(NOW - 2 * 24 * 60 * 60_000).toISOString(), NOW)).toBe("2d ago");
  });
});
