import { Device } from "../types/Device";
import {
  ALL_OFF_ACTIVITY_NAME,
  ALL_ON_ACTIVITY_NAME,
  buildAllOffActivity,
  buildAllOnActivity,
  looksLikeAllOffActivity,
  looksLikeAllOnActivity,
  powerCapableDevices,
  powerOffCapabilityFor,
  powerOnCapabilityFor,
  shouldOfferDefaultActivities,
} from "./defaultActivities";

const NOW = "2026-09-28T12:00:00.000Z";

function device(id: string, capabilities: Device["capabilities"]): Device {
  return { id, name: id, category: "tv", manufacturer: "acme", driverId: "acme-driver", capabilities };
}

const tv = device("tv", ["power", "inputSelection"]);
const receiver = device("receiver", ["power"]);
// Roku-shaped: powerOff only, no power/powerOn (see Capability.ts's own RokuEcpDriver comment).
const roku = device("roku", ["powerOff", "select"]);
// Xbox-shaped: powerOn only, no power/powerOff.
const xbox = device("xbox", ["powerOn"]);
const sensor = device("sensor", ["setTemperature"]);

describe("powerOnCapabilityFor / powerOffCapabilityFor", () => {
  test("prefers the direction-specific id over the shared toggle", () => {
    const both = device("both", ["power", "powerOn", "powerOff"]);
    expect(powerOnCapabilityFor(both)).toBe("powerOn");
    expect(powerOffCapabilityFor(both)).toBe("powerOff");
  });

  test("falls back to the shared toggle when no direction-specific id exists", () => {
    expect(powerOnCapabilityFor(tv)).toBe("power");
    expect(powerOffCapabilityFor(tv)).toBe("power");
  });

  test("returns null when a device can't be commanded in that direction", () => {
    expect(powerOnCapabilityFor(roku)).toBeNull();
    expect(powerOffCapabilityFor(xbox)).toBeNull();
  });

  test("returns null for a device with no power capability at all", () => {
    expect(powerOnCapabilityFor(sensor)).toBeNull();
    expect(powerOffCapabilityFor(sensor)).toBeNull();
  });
});

describe("powerCapableDevices", () => {
  test("keeps devices controllable in either direction, drops the rest", () => {
    expect(powerCapableDevices([tv, receiver, roku, xbox, sensor]).map((d) => d.id)).toEqual(["tv", "receiver", "roku", "xbox"]);
  });
});

describe("shouldOfferDefaultActivities", () => {
  test("false below the minimum power-capable device count", () => {
    expect(shouldOfferDefaultActivities([tv], [])).toBe(false);
  });

  test("true with enough power-capable devices and no existing All On/Off", () => {
    expect(shouldOfferDefaultActivities([tv, receiver], [])).toBe(true);
  });

  test("false once an Activity already reads as All On", () => {
    expect(shouldOfferDefaultActivities([tv, receiver], [{ name: "all on" }])).toBe(false);
  });

  test("false once an Activity already reads as All Off, even a renamed/qualified one", () => {
    expect(shouldOfferDefaultActivities([tv, receiver], [{ name: "All Off (Movie Room)" }])).toBe(false);
  });

  test("unrelated activity names don't block the offer", () => {
    expect(shouldOfferDefaultActivities([tv, receiver], [{ name: "Movie Night" }])).toBe(true);
  });
});

describe("looksLikeAllOnActivity / looksLikeAllOffActivity", () => {
  test("matches the exact default name case-insensitively", () => {
    expect(looksLikeAllOnActivity(ALL_ON_ACTIVITY_NAME.toUpperCase())).toBe(true);
    expect(looksLikeAllOffActivity(ALL_OFF_ACTIVITY_NAME.toUpperCase())).toBe(true);
  });

  test("does not cross-match All On against All Off", () => {
    expect(looksLikeAllOnActivity("All Off")).toBe(false);
    expect(looksLikeAllOffActivity("All On")).toBe(false);
  });

  test("plain unrelated names don't match either", () => {
    expect(looksLikeAllOnActivity("Movie Night")).toBe(false);
    expect(looksLikeAllOffActivity("Movie Night")).toBe(false);
  });
});

describe("buildAllOnActivity", () => {
  test("one step per capable device, in device-list order, preferring the direction-specific capability", () => {
    const activity = buildAllOnActivity([tv, receiver, roku, xbox], "gen-1", NOW);
    expect(activity.name).toBe(ALL_ON_ACTIVITY_NAME);
    expect(activity.steps).toEqual([
      { kind: "command", deviceId: "tv", capability: "power" },
      { kind: "command", deviceId: "receiver", capability: "power" },
      { kind: "command", deviceId: "xbox", capability: "powerOn" },
    ]);
  });

  test("an unsynced, valid draft ready for the normal save path", () => {
    const activity = buildAllOnActivity([tv], "gen-1", NOW);
    expect(activity).toMatchObject({ id: "gen-1", version: 0, updatedAt: NOW });
  });
});

describe("buildAllOffActivity", () => {
  test("one step per capable device, in the reverse of device-list order, preferring powerOff", () => {
    const activity = buildAllOffActivity([tv, receiver, roku, xbox], "gen-1", NOW);
    expect(activity.name).toBe(ALL_OFF_ACTIVITY_NAME);
    expect(activity.steps).toEqual([
      { kind: "command", deviceId: "roku", capability: "powerOff" },
      { kind: "command", deviceId: "receiver", capability: "power" },
      { kind: "command", deviceId: "tv", capability: "power" },
    ]);
  });

  test("does not mutate the input device list's order", () => {
    const devices = [tv, receiver];
    buildAllOffActivity(devices, "gen-1", NOW);
    expect(devices).toEqual([tv, receiver]);
  });
});
