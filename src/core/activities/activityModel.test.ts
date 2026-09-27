import { normalizeActivity, normalizeActivityList, sceneToActivity, validateActivity, clampNumber } from "./activityModel";
import { Scene } from "../types/Scene";
import { Activity } from "../types/Activity";

const NOW = "2026-09-26T12:00:00.000Z";

const scene: Scene = {
  id: "scene-1",
  name: "Movie Night",
  actions: [
    { deviceId: "tv", capability: "powerOn" },
    { deviceId: "tv", capability: "inputSelection", args: { input: "hdmi1" } },
    { deviceId: "rx", capability: "mute" },
  ],
};

describe("sceneToActivity", () => {
  test("keeps id, name, and every action in order as command steps with args intact", () => {
    const activity = sceneToActivity(scene, NOW);
    expect(activity.id).toBe("scene-1");
    expect(activity.name).toBe("Movie Night");
    expect(activity.steps).toEqual([
      { kind: "command", deviceId: "tv", capability: "powerOn" },
      { kind: "command", deviceId: "tv", capability: "inputSelection", args: { input: "hdmi1" } },
      { kind: "command", deviceId: "rx", capability: "mute" },
    ]);
  });

  test("a migrated scene starts unsynced so the Pi treats it as new", () => {
    expect(sceneToActivity(scene, NOW)).toMatchObject({ version: 0, updatedAt: NOW });
  });
});

describe("normalizeActivity", () => {
  test("loads a persisted legacy scene (actions, no kind) as an activity with no data loss", () => {
    const activity = normalizeActivity(JSON.parse(JSON.stringify(scene)), NOW) as Activity;
    expect(activity.steps).toHaveLength(3);
    expect(activity.steps[1]).toEqual({ kind: "command", deviceId: "tv", capability: "inputSelection", args: { input: "hdmi1" } });
  });

  test("keeps a well-formed activity unchanged", () => {
    const original: Activity = {
      id: "a",
      name: "Night",
      icon: "moon",
      version: 4,
      updatedAt: NOW,
      updatedBy: "Leah",
      steps: [
        { kind: "command", deviceId: "tv", capability: "powerOn", onFail: "retry:2" },
        { kind: "delay", ms: 2000 },
        { kind: "waitFor", deviceId: "tv", stateKey: "power", equals: "on", timeoutMs: 30000, onTimeout: "continue" },
      ],
    };
    expect(normalizeActivity(original, "other")).toEqual(original);
  });

  test("clamps out-of-range delay and timeout to the contract limits", () => {
    const activity = normalizeActivity(
      { id: "a", name: "x", steps: [{ kind: "delay", ms: 9_999_999 }, { kind: "waitFor", deviceId: "d", stateKey: "power", equals: "on", timeoutMs: 5 }] },
      NOW
    ) as Activity;
    expect(activity.steps[0]).toEqual({ kind: "delay", ms: 600_000 });
    expect(activity.steps[1]).toMatchObject({ timeoutMs: 1000 });
  });

  test("drops malformed steps and records without an id or name", () => {
    const activity = normalizeActivity({ id: "a", name: "x", steps: [{ kind: "bogus" }, null, { kind: "delay", ms: 10 }] }, NOW) as Activity;
    expect(activity.steps).toEqual([{ kind: "delay", ms: 10 }]);
    expect(normalizeActivity({ name: "no id" }, NOW)).toBeNull();
    expect(normalizeActivity({ id: "a", name: "   " }, NOW)).toBeNull();
    expect(normalizeActivity("nope", NOW)).toBeNull();
  });

  test("truncates a too-long name and caps steps at 50", () => {
    const steps = Array.from({ length: 60 }, () => ({ kind: "delay", ms: 1 }));
    const activity = normalizeActivity({ id: "a", name: "n".repeat(120), steps }, NOW) as Activity;
    expect(activity.name).toHaveLength(80);
    expect(activity.steps).toHaveLength(50);
  });
});

describe("normalizeActivityList", () => {
  test("returns an empty list for non-arrays and skips unusable entries", () => {
    expect(normalizeActivityList(undefined, NOW)).toEqual([]);
    expect(normalizeActivityList([scene, { bad: true }], NOW)).toHaveLength(1);
  });
});

describe("validateActivity", () => {
  const valid: Activity = { id: "a", name: "Ok", steps: [{ kind: "delay", ms: 1 }], version: 0, updatedAt: NOW };

  test("accepts a valid activity", () => expect(validateActivity(valid)).toBeNull());
  test("rejects an empty name", () => expect(validateActivity({ ...valid, name: "  " })).toMatch(/Name/));
  test("rejects no steps", () => expect(validateActivity({ ...valid, steps: [] })).toMatch(/at least one/));
  test("rejects an implausible Home Assistant outgoing webhook URL", () =>
    expect(validateActivity({ ...valid, homeAssistant: { outgoingWebhookUrl: "not a url" } })).toMatch(/doesn't look like/));
  test("accepts an activity with a Home Assistant webhook config", () =>
    expect(validateActivity({ ...valid, homeAssistant: { incomingWebhookId: "abc-123", outgoingWebhookUrl: "https://ha.example.com/api/webhook/xyz" } })).toBeNull());
});

describe("normalizeActivity Home Assistant field", () => {
  test("preserves a stored homeAssistant config", () => {
    const raw = { id: "a", name: "Ok", steps: [], version: 1, updatedAt: NOW, homeAssistant: { incomingWebhookId: "abc-123" } };
    expect(normalizeActivity(raw, NOW)?.homeAssistant).toEqual({ incomingWebhookId: "abc-123" });
  });

  test("leaves homeAssistant unset when the raw record never had it", () => {
    const raw = { id: "a", name: "Ok", steps: [], version: 1, updatedAt: NOW };
    expect(normalizeActivity(raw, NOW)?.homeAssistant).toBeUndefined();
  });
});

test("clampNumber falls back to the minimum for non-finite input", () => {
  expect(clampNumber(NaN, 1, 5)).toBe(1);
  expect(clampNumber(9, 1, 5)).toBe(5);
});
