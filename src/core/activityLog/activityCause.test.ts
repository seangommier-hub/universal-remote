import { causeOfWho, whoForCause } from "./activityCause";
import { describeActivityEntry } from "./activityLogFormat";

describe("activity cause", () => {
  test("each cause maps to its display text and back", () => {
    expect(whoForCause({ kind: "activity", name: "Movie night" })).toBe("Movie night (Activity)");
    expect(whoForCause({ kind: "kid-mode", phoneName: "" })).toBe("Kid mode");
    expect(whoForCause({ kind: "kid-mode", phoneName: "Leah's iPhone" })).toBe("Leah's iPhone (kid mode)");
    expect(whoForCause({ kind: "schedule" })).toBe("Schedule");
    expect(whoForCause({ kind: "schedule", name: "Bedtime" })).toBe("Bedtime (schedule)");
    expect(whoForCause({ kind: "home-assistant" })).toBe("Home Assistant");
    expect(["Movie night (Activity)", "Kid mode", "Leah's iPhone (kid mode)", "Schedule", "Bedtime (schedule)", "Home Assistant"].map(causeOfWho)).toEqual([
      "activity",
      "kid-mode",
      "kid-mode",
      "schedule",
      "schedule",
      "home-assistant",
    ]);
  });

  test("entries written before causes existed, and ordinary names, are a person", () => {
    expect(["Sean", "Someone's iPhone", "Kid", "Activity"].map(causeOfWho)).toEqual(["person", "person", "person", "person"]);
  });

  test("a blank activity name still reads sensibly", () => {
    expect(whoForCause({ kind: "activity", name: "  " })).toBe("An Activity (Activity)");
  });

  test("the Recent activity line reads naturally for each cause", () => {
    const base = { id: "1", deviceId: "d", deviceName: "Den TV", verb: "turned off", ok: true, at: new Date(2026, 8, 26, 21, 40).toISOString() };
    const now = new Date(2026, 8, 26, 22, 0);
    expect(describeActivityEntry({ ...base, who: "Sean" }, now)).toBe("Sean turned off Den TV · 9:40 pm");
    expect(describeActivityEntry({ ...base, who: "Movie night (Activity)" }, now)).toBe("Movie night (Activity) turned off Den TV · 9:40 pm");
    expect(describeActivityEntry({ ...base, who: "Kid mode" }, now)).toBe("Kid mode turned off Den TV · 9:40 pm");
  });
});
