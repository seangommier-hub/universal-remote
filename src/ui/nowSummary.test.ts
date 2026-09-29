import { DeviceListModel } from "../core/layout/deviceGrouping";
import { Device } from "../core/types/Device";
import { buildNowRows, describeNowStatus, isDeviceOn, offCapabilityFor } from "./nowSummary";

function device(overrides: Partial<Device> = {}): Device {
  return { id: "d1", name: "Device", category: "tv", manufacturer: "Acme", driverId: "acme", capabilities: [], ...overrides };
}

describe("offCapabilityFor", () => {
  test("prefers powerOff over power, same precedence as UniversalTvRemote's own power button", () => {
    expect(offCapabilityFor(device({ capabilities: ["powerOff", "power"] }))).toBe("powerOff");
  });

  test("falls back to the toggle power capability", () => {
    expect(offCapabilityFor(device({ capabilities: ["power"] }))).toBe("power");
  });

  test("returns null when the device has no off-capable action at all", () => {
    expect(offCapabilityFor(device({ capabilities: ["powerOn"] }))).toBeNull();
  });
});

describe("isDeviceOn", () => {
  test("true for a connected device reporting power on", () => {
    expect(isDeviceOn(device({ capabilities: ["power"] }), { connection: "connected", values: { power: "on" } })).toBe(true);
  });

  test("false for a connected device reporting power off", () => {
    expect(isDeviceOn(device({ capabilities: ["power"] }), { connection: "connected", values: { power: "off" } })).toBe(false);
  });

  test("true while playing, even with no power value at all (e.g. a Roku that only declares powerOff)", () => {
    expect(isDeviceOn(device({ capabilities: ["powerOff"] }), { connection: "connected", values: { playbackState: "playing" } })).toBe(true);
  });

  test("true while paused", () => {
    expect(isDeviceOn(device({ capabilities: ["powerOff"] }), { connection: "connected", values: { playbackState: "paused" } })).toBe(true);
  });

  test("false when disconnected, even if a stale power value says on", () => {
    expect(isDeviceOn(device({ capabilities: ["power"] }), { connection: "disconnected", values: { power: "on" } })).toBe(false);
  });

  test("false when unknown", () => {
    expect(isDeviceOn(device({ capabilities: ["power"] }), { connection: "unknown", values: { power: "on" } })).toBe(false);
  });

  test("false for a device with neither power nor powerOff, even if something set power on anyway (e.g. Sonos, which has no off action at all)", () => {
    expect(isDeviceOn(device({ capabilities: ["volumeUp", "playPause"] }), { connection: "connected", values: { power: "on", playbackState: "playing" } })).toBe(false);
  });

  test("false for an excluded category (camera, sensor, action) even with power on", () => {
    expect(isDeviceOn(device({ category: "camera", capabilities: ["power"] }), { connection: "connected", values: { power: "on" } })).toBe(false);
    expect(isDeviceOn(device({ category: "sensor", capabilities: ["power"] }), { connection: "connected", values: { power: "on" } })).toBe(false);
    expect(isDeviceOn(device({ category: "action", capabilities: ["power"] }), { connection: "connected", values: { power: "on" } })).toBe(false);
  });

  test("false for a lock/cover/alarm/vacuum -- none of these declare power or powerOff in this codebase", () => {
    expect(isDeviceOn(device({ category: "lock", capabilities: ["lock", "unlock"] }), { connection: "connected", values: { lockState: "locked" } })).toBe(false);
    expect(isDeviceOn(device({ category: "vacuum", capabilities: ["vacuumStart", "vacuumStop"] }), { connection: "connected", values: { vacuumState: "cleaning" } })).toBe(false);
  });
});

describe("describeNowStatus", () => {
  test("plain On with no playback state", () => {
    expect(describeNowStatus({ power: "on" })).toBe("On");
  });

  test("the live app name while playing", () => {
    expect(describeNowStatus({ playbackState: "playing", activeAppName: "Netflix" })).toBe("Netflix");
  });

  test("the app name plus (paused) while paused", () => {
    expect(describeNowStatus({ playbackState: "paused", activeAppName: "Netflix" })).toBe("Netflix (paused)");
  });

  test("the generic Playing when nothing names the app", () => {
    expect(describeNowStatus({ playbackState: "playing" })).toBe("Playing");
  });

  test("the generic Paused when nothing names the app", () => {
    expect(describeNowStatus({ playbackState: "paused" })).toBe("Paused");
  });
});

describe("buildNowRows", () => {
  function model(devices: Device[]): DeviceListModel {
    return { mode: "type", favorites: [], grouped: true, sections: [{ key: "tvStreaming", title: "TVs & Streaming", devices, collapsed: false }] };
  }

  test("includes only the on devices, in section order, each with its status and off capability", () => {
    const on = device({ id: "on", name: "Living Room TV", capabilities: ["powerOff"] });
    const off = device({ id: "off", name: "Bedroom TV", capabilities: ["powerOff"] });
    const states: Record<string, { connection: "connected"; values: Record<string, unknown> }> = {
      on: { connection: "connected", values: { power: "on" } },
      off: { connection: "connected", values: { power: "off" } },
    };
    const rows = buildNowRows(model([on, off]), (id) => states[id]);
    expect(rows).toEqual([{ device: on, status: "On", offCapability: "powerOff" }]);
  });

  test("returns an empty list when nothing is on", () => {
    const off = device({ id: "off", capabilities: ["power"] });
    const rows = buildNowRows(model([off]), () => ({ connection: "connected", values: { power: "off" } }));
    expect(rows).toEqual([]);
  });
});
