import { describeStoredTime, nextOccurrence, parseStoredTime, parseTypedTime } from "./scheduleTime";

// Fixed zone with real DST rules so the calendar tests do not depend on where the tests run.
process.env.TZ = "America/New_York";

const SCHOOL_NIGHTS = [0, 1, 2, 3, 4];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

test("parseStoredTime reads HH:MM and rejects everything else", () => {
  expect(parseStoredTime("20:30")).toEqual({ hour: 20, minute: 30 });
  expect(parseStoredTime("00:00")).toEqual({ hour: 0, minute: 0 });
  for (const bad of ["24:00", "8:30", "20:60", "", "20:30:00", "ab:cd"]) expect(parseStoredTime(bad)).toBeNull();
});

test("parseTypedTime understands 12-hour and 24-hour typing", () => {
  expect(parseTypedTime("8:30 pm")).toBe("20:30");
  expect(parseTypedTime("8PM")).toBe("20:00");
  expect(parseTypedTime("12:05 AM")).toBe("00:05");
  expect(parseTypedTime("12 pm")).toBe("12:00");
  expect(parseTypedTime("20:30")).toBe("20:30");
  expect(parseTypedTime("9:05")).toBe("09:05");
});

test("parseTypedTime rejects nonsense", () => {
  for (const bad of ["", "25:00", "13 pm", "0 am", "8:75 pm", "eight", "8:30:15"]) expect(parseTypedTime(bad)).toBeNull();
});

test("describeStoredTime shows a 12-hour clock", () => {
  expect(describeStoredTime("20:30")).toBe("8:30 PM");
  expect(describeStoredTime("00:05")).toBe("12:05 AM");
  expect(describeStoredTime("12:00")).toBe("12:00 PM");
  expect(describeStoredTime("junk")).toBe("junk");
});

test("nextOccurrence picks the same evening when it has not passed yet", () => {
  const monday5pm = new Date(2026, 8, 21, 17, 0);
  expect(nextOccurrence(SCHOOL_NIGHTS, "20:30", monday5pm)).toEqual(new Date(2026, 8, 21, 20, 30));
});

test("nextOccurrence skips to the next allowed day once the time has passed", () => {
  const thursday9pm = new Date(2026, 8, 24, 21, 0);
  expect(nextOccurrence(SCHOOL_NIGHTS, "20:30", thursday9pm)).toEqual(new Date(2026, 8, 27, 20, 30));
  const fridayMorning = new Date(2026, 8, 25, 8, 0);
  expect(nextOccurrence(SCHOOL_NIGHTS, "20:30", fridayMorning)).toEqual(new Date(2026, 8, 27, 20, 30));
});

test("nextOccurrence is strictly after the given instant", () => {
  const exactly = new Date(2026, 8, 21, 20, 30);
  expect(nextOccurrence(EVERY_DAY, "20:30", exactly)).toEqual(new Date(2026, 8, 22, 20, 30));
});

test("nextOccurrence crosses midnight and month ends", () => {
  expect(nextOccurrence(EVERY_DAY, "00:15", new Date(2026, 8, 30, 23, 59))).toEqual(new Date(2026, 9, 1, 0, 15));
  expect(nextOccurrence([3], "07:00", new Date(2026, 11, 31, 12, 0))).toEqual(new Date(2027, 0, 6, 7, 0));
});

test("nextOccurrence returns null for no days or a malformed time", () => {
  expect(nextOccurrence([], "20:30", new Date())).toBeNull();
  expect(nextOccurrence(EVERY_DAY, "8pm", new Date())).toBeNull();
});

test("a time inside the spring-forward gap fires once, right after the gap", () => {
  const gapDay = nextOccurrence(EVERY_DAY, "02:30", new Date(2026, 2, 8, 0, 30)) as Date;
  expect(gapDay.getDate()).toBe(8);
  expect(gapDay.getHours()).toBe(3);
  expect(gapDay.getMinutes()).toBe(30);
});

test("a time repeated by the fall-back fires only once that day", () => {
  const first = nextOccurrence(EVERY_DAY, "01:30", new Date(2026, 10, 1, 0, 30)) as Date;
  expect(first.getDate()).toBe(1);
  expect(first.getHours()).toBe(1);
  const afterFirst = nextOccurrence(EVERY_DAY, "01:30", first) as Date;
  expect(afterFirst.getDate()).toBe(2);
});

test("a fixed clock time keeps its local hour across the DST change", () => {
  const friday = new Date(2026, 2, 6, 21, 0);
  const saturday = nextOccurrence(EVERY_DAY, "20:30", friday) as Date;
  const sunday = nextOccurrence(EVERY_DAY, "20:30", saturday) as Date;
  expect([saturday.getHours(), sunday.getHours()]).toEqual([20, 20]);
  expect(sunday.getTime() - saturday.getTime()).toBe(23 * 3600 * 1000);
});
