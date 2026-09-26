import { commandChoicesFor, commandStepFromChoice, describeStep } from "./activityChoices";
import { appendStep, cycleWaitCondition, describeFailurePolicy, moveStep, newWaitStep, nextFailurePolicy, nudgeDelay, removeStepAt } from "./activityStepEditing";
import { buildActivityRun, describeRun, formatClockTime, summarizeSteps } from "./activityRunReport";
import { ActivityRun, ActivityStep, StepFailurePolicy } from "../types/Activity";
import { Device } from "../types/Device";

const tv: Device = { id: "tv", name: "Living Room TV", category: "tv", manufacturer: "LG", driverId: "lg", capabilities: ["powerOn", "powerOff", "inputSelection", "launchApp", "setVolume", "directionalNavigation"] };
const inputs = [{ id: "hdmi1", label: "HDMI 1" }];
const delay = (ms: number): ActivityStep => ({ kind: "delay", ms });

describe("commandChoicesFor", () => {
  test("offers only capabilities the device declares, with inputs from live state", () => {
    const labels = commandChoicesFor(tv, inputs).map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["Power On", "Power Off", "Input: HDMI 1", "Launch Netflix", "Volume 30"]));
    expect(labels).not.toContain("Mute");
    expect(labels.some((l) => /direction/i.test(l))).toBe(false);
  });

  test("no input choices when the live input list is missing", () => {
    expect(commandChoicesFor(tv, undefined).some((c) => c.capability === "inputSelection")).toBe(false);
  });

  test("a picked choice becomes a command step carrying its args", () => {
    const choice = commandChoicesFor(tv, inputs).find((c) => c.label === "Volume 20")!;
    expect(commandStepFromChoice("tv", choice)).toEqual({ kind: "command", deviceId: "tv", capability: "setVolume", args: { volume: 20 } });
  });
});

describe("describeStep", () => {
  const inputsOf = () => inputs;
  test("describes each kind in plain language", () => {
    expect(describeStep({ kind: "delay", ms: 3000 }, [tv], inputsOf)).toBe("Wait 3s");
    expect(describeStep(newWaitStep("tv"), [tv], inputsOf)).toBe("Wait until Living Room TV is on");
    expect(describeStep({ kind: "command", deviceId: "tv", capability: "inputSelection", args: { input: "hdmi1" } }, [tv], inputsOf)).toBe("Living Room TV: input HDMI 1");
    expect(describeStep({ kind: "command", deviceId: "tv", capability: "setVolume", args: { volume: 25 } }, [tv], inputsOf)).toBe("Living Room TV: volume 25");
  });
});

describe("step editing", () => {
  test("moveStep swaps neighbours and ignores the edges", () => {
    const steps = [delay(1), delay(2), delay(3)];
    expect(moveStep(steps, 1, -1)).toEqual([delay(2), delay(1), delay(3)]);
    expect(moveStep(steps, 0, -1)).toBe(steps);
    expect(moveStep(steps, 2, 1)).toBe(steps);
  });

  test("removeStepAt drops just that step", () => {
    expect(removeStepAt([delay(1), delay(2)], 0)).toEqual([delay(2)]);
  });

  test("appendStep refuses to exceed 50 steps", () => {
    const full = Array.from({ length: 50 }, () => delay(1));
    expect(appendStep(full, delay(2))).toBe(full);
  });

  test("nudgeDelay stays within 0 to 600000 ms", () => {
    expect(nudgeDelay({ kind: "delay", ms: 500 }, -1000).ms).toBe(0);
    expect(nudgeDelay({ kind: "delay", ms: 599_500 }, 1000).ms).toBe(600_000);
  });

  test("cycleWaitCondition flips between on and off", () => {
    const on = newWaitStep("tv");
    expect(cycleWaitCondition(on).equals).toBe("off");
    expect(cycleWaitCondition(cycleWaitCondition(on)).equals).toBe("on");
  });

  test("failure policy cycles through all five and is described plainly", () => {
    const seen: StepFailurePolicy[] = [];
    let policy = nextFailurePolicy(undefined);
    for (let i = 0; i < 4; i++) {
      seen.push(policy);
      policy = nextFailurePolicy(policy);
    }
    expect(seen).toEqual(["stop", "retry:1", "retry:2", "retry:3"]);
    expect(policy).toBe("continue");
    expect(describeFailurePolicy("retry:2")).toBe("If it fails: retry 2x");
  });
});

describe("run report", () => {
  const run: ActivityRun = {
    runId: "r",
    activityId: "a",
    activityName: "Movie Night",
    startedAt: new Date(2026, 8, 26, 21, 2, 0).toISOString(),
    finishedAt: new Date(2026, 8, 26, 21, 2, 30).toISOString(),
    by: "Leah",
    steps: [{ index: 0, status: "ok" }, { index: 1, status: "failed", error: "x" }],
  };

  test("history line reads like the household would say it", () => {
    expect(describeRun(run)).toBe("Movie Night ran 9:02 PM by Leah, 1 step failed");
  });

  test("summaries cover all-ok, failed, and skipped", () => {
    expect(summarizeSteps([{ index: 0, status: "ok" }])).toBe("all steps ok");
    expect(summarizeSteps([{ index: 0, status: "failed" }, { index: 1, status: "failed" }, { index: 2, status: "skipped" }])).toBe("2 steps failed, 1 skipped");
    expect(summarizeSteps([{ index: 0, status: "skipped" }])).toBe("1 step skipped");
  });

  test("clock time handles midnight and noon", () => {
    expect(formatClockTime(new Date(2026, 0, 1, 0, 5).toISOString())).toBe("12:05 AM");
    expect(formatClockTime(new Date(2026, 0, 1, 12, 0).toISOString())).toBe("12:00 PM");
  });

  test("the wire body carries only contract fields and defaults a missing name", () => {
    const body = buildActivityRun({ ...run, cancelled: true } as never, undefined);
    expect(Object.keys(body).sort()).toEqual(["activityId", "activityName", "by", "finishedAt", "runId", "startedAt", "steps"]);
    expect(body.by).toBe("someone");
    expect(body.steps[1]).toEqual({ index: 1, status: "failed", error: "x" });
  });
});
