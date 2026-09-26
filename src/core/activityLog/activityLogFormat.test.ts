import { ActivityLogEntry } from "./activityLogEntry";
import { describeActivityEntry, describeActivityTime } from "./activityLogFormat";

const NOW = new Date(2026, 8, 26, 22, 0);

function entry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: "e1",
    deviceId: "tv",
    deviceName: "Den TV",
    verb: "turned off",
    ok: true,
    at: new Date(2026, 8, 26, 21, 40).toISOString(),
    who: "Sean",
    ...overrides,
  };
}

describe("describeActivityEntry", () => {
  test("formats a success as 'who verb device · time'", () => {
    expect(describeActivityEntry(entry(), NOW)).toBe("Sean turned off Den TV · 9:40 pm");
  });

  test("a failure leads with 'Didn't work'", () => {
    expect(describeActivityEntry(entry({ ok: false, error: "it didn't respond" }), NOW)).toBe("Didn't work: Sean turned off Den TV · 9:40 pm");
  });

  test("a bad timestamp drops the time instead of showing nonsense", () => {
    expect(describeActivityEntry(entry({ at: "not a date" }), NOW)).toBe("Sean turned off Den TV");
  });
});

describe("describeActivityTime", () => {
  test("midnight and noon use 12, not 0", () => {
    expect(describeActivityTime(new Date(2026, 8, 26, 0, 5).toISOString(), NOW)).toBe("12:05 am");
    expect(describeActivityTime(new Date(2026, 8, 26, 12, 0).toISOString(), NOW)).toBe("12:00 pm");
  });

  test("yesterday shows the weekday, and older than a week shows the date", () => {
    expect(describeActivityTime(new Date(2026, 8, 25, 9, 5).toISOString(), NOW)).toBe("Fri 9:05 am");
    expect(describeActivityTime(new Date(2026, 8, 12, 18, 30).toISOString(), NOW)).toBe("Sep 12, 6:30 pm");
  });
});
