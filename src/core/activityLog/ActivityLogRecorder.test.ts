import { Device } from "../types/Device";
import { Command, CommandResult } from "../types/Command";
import { ActivityLogRecorder, MAX_PENDING_ENTRIES, REPEAT_WINDOW_MS } from "./ActivityLogRecorder";
import { MAX_WHO_LENGTH } from "./activityLogEntry";

const DEN_TV: Device = { id: "tv", name: "Den TV", category: "tv", manufacturer: "LG", driverId: "lg", capabilities: ["powerOff", "volumeUp"] };

function result(command: Command, overrides: Partial<CommandResult> = {}): CommandResult {
  return { success: true, deviceId: command.deviceId, capability: command.capability, timestamp: 1_800_000_000_000, ...overrides };
}

function build(who = "Sean") {
  let clock = 1_000_000;
  let counter = 0;
  const changes: number[] = [];
  const recorder = new ActivityLogRecorder({
    getWho: () => who,
    newId: () => `id-${++counter}`,
    now: () => clock,
    onChange: (pending) => changes.push(pending.length),
  });
  return { recorder, advance: (ms: number) => (clock += ms), changes };
}

const powerOff: Command = { deviceId: "tv", capability: "powerOff" };

describe("ActivityLogRecorder", () => {
  test("records a success with who, device name, verb and time", () => {
    const { recorder } = build();
    recorder.record(powerOff, DEN_TV, result(powerOff));
    expect(recorder.peek(10)).toEqual([
      { id: "id-1", deviceId: "tv", deviceName: "Den TV", verb: "turned off", ok: true, at: new Date(1_800_000_000_000).toISOString(), who: "Sean" },
    ]);
  });

  test("a failure keeps only a short fixed reason, never the driver's raw message", () => {
    const { recorder } = build();
    const failed = result(powerOff, { success: false, error: { code: "driver_error", message: "ECONNREFUSED 192.168.1.9 Authorization: Bearer abc" } });
    recorder.record(powerOff, DEN_TV, failed);
    const [logged] = recorder.peek(1);
    expect(logged.ok).toBe(false);
    expect(logged.error).toBe("it didn't respond");
    expect(JSON.stringify(logged)).not.toContain("192.168");
    expect(JSON.stringify(logged)).not.toContain("Bearer");
  });

  test("typed text is logged as 'typed text' only", () => {
    const { recorder } = build();
    const typing: Command = { deviceId: "tv", capability: "textEntry", args: { text: "my-password-123" } };
    recorder.record(typing, DEN_TV, result(typing));
    expect(JSON.stringify(recorder.peek(1))).not.toContain("my-password");
    expect(recorder.peek(1)[0].verb).toBe("typed text on");
  });

  test("successful navigation presses are not recorded", () => {
    const { recorder } = build();
    const up: Command = { deviceId: "tv", capability: "directionalNavigation", args: { direction: "up" } };
    recorder.record(up, DEN_TV, result(up));
    expect(recorder.pendingCount).toBe(0);
  });

  test("the same action repeated within the window is one entry, and counts again after it", () => {
    const { recorder, advance } = build();
    const volume: Command = { deviceId: "tv", capability: "volumeUp" };
    recorder.record(volume, DEN_TV, result(volume));
    advance(REPEAT_WINDOW_MS - 1);
    recorder.record(volume, DEN_TV, result(volume));
    expect(recorder.pendingCount).toBe(1);
    advance(REPEAT_WINDOW_MS);
    recorder.record(volume, DEN_TV, result(volume));
    expect(recorder.pendingCount).toBe(2);
  });

  test("drops the oldest entries beyond the outbox cap", () => {
    const { recorder, advance } = build();
    for (let i = 0; i < MAX_PENDING_ENTRIES + 25; i += 1) {
      advance(REPEAT_WINDOW_MS);
      recorder.record(powerOff, { ...DEN_TV, name: `TV ${i}` }, result(powerOff));
    }
    expect(recorder.pendingCount).toBe(MAX_PENDING_ENTRIES);
    expect(recorder.peek(1)[0].deviceName).toBe("TV 25");
  });

  test("acknowledge removes only the delivered entries", () => {
    const { recorder, advance } = build();
    recorder.record(powerOff, DEN_TV, result(powerOff));
    advance(REPEAT_WINDOW_MS);
    recorder.record({ deviceId: "tv", capability: "volumeUp" }, DEN_TV, result(powerOff));
    recorder.acknowledge(["id-1"]);
    expect(recorder.peek(10).map((e) => e.id)).toEqual(["id-2"]);
  });

  test("an overlong or blank name is clamped or replaced", () => {
    const long = build("x".repeat(500)).recorder;
    long.record(powerOff, DEN_TV, result(powerOff));
    expect(long.peek(1)[0].who).toHaveLength(MAX_WHO_LENGTH);
    const blank = build("   ").recorder;
    blank.record(powerOff, DEN_TV, result(powerOff));
    expect(blank.peek(1)[0].who).toBe("Someone");
  });

  test("restore puts saved entries ahead of new ones, and listeners hear about new entries", () => {
    const { recorder } = build();
    const heard = jest.fn();
    recorder.onRecorded(heard);
    recorder.record(powerOff, DEN_TV, result(powerOff));
    const saved = { id: "old", deviceId: "tv", deviceName: "Den TV", verb: "turned on", ok: true, at: "2026-09-25T01:00:00.000Z", who: "Sean" };
    recorder.restore([saved]);
    expect(recorder.peek(10).map((e) => e.id)).toEqual(["old", "id-1"]);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
