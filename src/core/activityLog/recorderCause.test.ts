import { Command, CommandResult } from "../types/Command";
import { Device } from "../types/Device";
import { ActivityLogRecorder } from "./ActivityLogRecorder";

const DEN_TV: Device = { id: "tv", name: "Den TV", category: "tv", manufacturer: "LG", driverId: "lg", capabilities: ["powerOff"] };
const powerOff: Command = { deviceId: "tv", capability: "powerOff" };
const done: CommandResult = { success: true, deviceId: "tv", capability: "powerOff", timestamp: 1_800_000_000_000 };

function build(who: string) {
  let counter = 0;
  return new ActivityLogRecorder({ getWho: () => who, newId: () => `id-${++counter}`, now: () => 1_000_000 });
}

describe("ActivityLogRecorder cause attribution", () => {
  test("an Activity step is attributed to the Activity, not the person", () => {
    const recorder = build("Sean");
    recorder.record(powerOff, DEN_TV, done, { kind: "activity", name: "Movie night" });
    expect(recorder.peek(1)[0].who).toBe("Movie night (Activity)");
  });

  test("with no cause the owner's own name (or kid-mode name from getWho) is used", () => {
    const recorder = build("Kid mode");
    recorder.record(powerOff, DEN_TV, done);
    expect(recorder.peek(1)[0].who).toBe("Kid mode");
  });

  test("the entry keeps exactly the fields the Pi's strict schema already accepts", () => {
    const recorder = build("Sean");
    recorder.record(powerOff, DEN_TV, done, { kind: "activity", name: "Movie night" });
    expect(Object.keys(recorder.peek(1)[0]).sort()).toEqual(["at", "deviceId", "deviceName", "id", "ok", "verb", "who"]);
  });
});
