import { Activity, ActivitySchedule } from "../types/Activity";
import { normalizeActivity, validateActivity } from "./activityModel";
import { addSchedule, describeDays, describeSchedule, newSchedule, removeSchedule, toggleDay, updateSchedule } from "./scheduleEditing";
import { normalizeSchedule, normalizeSchedules, validateSchedules } from "./scheduleModel";
import { MAX_SCHEDULES_PER_ACTIVITY } from "./activityLimits";

const NOW = "2026-09-26T00:00:00.000Z";
const STEP = { kind: "delay", ms: 1000 };

test("normalizeSchedule keeps a good schedule and sorts and dedupes days", () => {
  expect(normalizeSchedule({ id: "s1", days: [4, 1, 1, 0], at: "20:30", enabled: true })).toEqual({ id: "s1", days: [0, 1, 4], at: "20:30", enabled: true });
});

test("normalizeSchedule treats a missing enabled flag as on and drops out-of-range days", () => {
  expect(normalizeSchedule({ id: "s1", days: [9, -1, 2, 2.5], at: "07:00" })).toEqual({ id: "s1", days: [2], at: "07:00", enabled: true });
});

test("normalizeSchedule rejects bad ids, times and empty day lists", () => {
  expect(normalizeSchedule({ id: "has space", days: [1], at: "07:00" })).toBeNull();
  expect(normalizeSchedule({ id: "s1", days: [1], at: "7am" })).toBeNull();
  expect(normalizeSchedule({ id: "s1", days: [], at: "07:00" })).toBeNull();
  expect(normalizeSchedule("nope")).toBeNull();
});

test("normalizeSchedules drops duplicates, caps the list, and is undefined for non-lists", () => {
  const many = Array.from({ length: MAX_SCHEDULES_PER_ACTIVITY + 3 }, (_, i) => ({ id: `s${i}`, days: [1], at: "07:00" }));
  expect(normalizeSchedules(many)).toHaveLength(MAX_SCHEDULES_PER_ACTIVITY);
  expect(normalizeSchedules([{ id: "a", days: [1], at: "07:00" }, { id: "a", days: [2], at: "08:00" }])).toHaveLength(1);
  expect(normalizeSchedules(undefined)).toBeUndefined();
  expect(normalizeSchedules("x")).toBeUndefined();
});

test("an older activity without schedules stays without them, and one with schedules keeps them", () => {
  const plain = normalizeActivity({ id: "a", name: "Old", steps: [STEP] }, NOW) as Activity;
  expect(plain).not.toHaveProperty("schedules");
  const scheduled = normalizeActivity({ id: "a", name: "New", steps: [STEP], schedules: [{ id: "s1", days: [1], at: "07:00", enabled: false }] }, NOW) as Activity;
  expect(scheduled.schedules).toEqual([{ id: "s1", days: [1], at: "07:00", enabled: false }]);
});

test("validateSchedules flags empty days, bad times and too many schedules", () => {
  expect(validateSchedules(undefined)).toBeNull();
  expect(validateSchedules([])).toBeNull();
  expect(validateSchedules([{ id: "a", days: [], at: "07:00", enabled: true }])).toMatch(/at least one day/);
  expect(validateSchedules([{ id: "a", days: [1], at: "bad", enabled: true }])).toMatch(/valid time/);
  const tooMany = Array.from({ length: MAX_SCHEDULES_PER_ACTIVITY + 1 }, (_, i) => ({ id: `s${i}`, days: [1], at: "07:00", enabled: true }));
  expect(validateSchedules(tooMany)).toMatch(/at most/);
});

test("validateActivity surfaces a schedule problem", () => {
  const activity: Activity = { id: "a", name: "Bedtime", steps: [{ kind: "delay", ms: 1 }], version: 1, updatedAt: NOW, schedules: [{ id: "a", days: [], at: "07:00", enabled: true }] };
  expect(validateActivity(activity)).toMatch(/at least one day/);
  expect(validateActivity({ ...activity, schedules: [] })).toBeNull();
});

test("schedule edit helpers add, update, remove and cap", () => {
  let schedules: ActivitySchedule[] = [];
  schedules = addSchedule(schedules, newSchedule("a"));
  expect(schedules[0]).toMatchObject({ id: "a", at: "21:00", enabled: true, days: [0, 1, 2, 3, 4, 5, 6] });
  schedules = updateSchedule(schedules, "a", { enabled: false, at: "20:30" });
  expect(schedules[0]).toMatchObject({ enabled: false, at: "20:30" });
  expect(removeSchedule(schedules, "a")).toEqual([]);
  let full: ActivitySchedule[] = [];
  for (let i = 0; i < MAX_SCHEDULES_PER_ACTIVITY + 2; i++) full = addSchedule(full, newSchedule(`s${i}`));
  expect(full).toHaveLength(MAX_SCHEDULES_PER_ACTIVITY);
});

test("toggleDay adds and removes while keeping days sorted", () => {
  expect(toggleDay([0, 2], 1)).toEqual([0, 1, 2]);
  expect(toggleDay([0, 1, 2], 1)).toEqual([0, 2]);
});

test("describeSchedule words the common cases plainly", () => {
  expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  expect(describeDays([1, 2, 3, 4, 5])).toBe("Weekdays");
  expect(describeDays([6, 0])).toBe("Weekends");
  expect(describeSchedule({ id: "a", days: [0, 1, 2, 3, 4], at: "20:30", enabled: true })).toBe("Sun to Thu at 8:30 PM");
  expect(describeDays([1, 3])).toBe("Mon, Wed");
});
