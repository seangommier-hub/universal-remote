import { DEVICE_OUTAGE_GRACE_MS, DeviceOutageTracker } from "./deviceOutageTracker";

const T0 = 5_000_000;
const MINUTE = 60_000;

describe("DeviceOutageTracker", () => {
  test("a device that was never connected is never an outage", () => {
    const tracker = new DeviceOutageTracker();
    tracker.observe("tv", "disconnected", false, T0);
    expect(tracker.outages(T0 + 10 * MINUTE)).toEqual([]);
  });

  test("a connected device that goes silent is reported only after the grace period", () => {
    const tracker = new DeviceOutageTracker();
    tracker.observe("tv", "connected", false, T0);
    tracker.observe("tv", "disconnected", false, T0 + MINUTE);
    expect(tracker.outages(T0 + MINUTE + DEVICE_OUTAGE_GRACE_MS - 1)).toEqual([]);
    expect(tracker.outages(T0 + 6 * MINUTE)).toEqual([{ deviceId: "tv", silentMs: 5 * MINUTE }]);
  });

  test("repeated not-connected observations do not restart the clock", () => {
    const tracker = new DeviceOutageTracker();
    tracker.observe("tv", "connected", false, T0);
    tracker.observe("tv", "disconnected", false, T0);
    tracker.observe("tv", "unknown", false, T0 + MINUTE);
    expect(tracker.outages(T0 + 3 * MINUTE)).toHaveLength(1);
  });

  test("reconnecting clears the outage", () => {
    const tracker = new DeviceOutageTracker();
    tracker.observe("tv", "connected", false, T0);
    tracker.observe("tv", "disconnected", false, T0);
    tracker.observe("tv", "connected", false, T0 + MINUTE);
    expect(tracker.outages(T0 + 10 * MINUTE)).toEqual([]);
  });

  test("a wake burst pauses the clock and it restarts when the burst ends", () => {
    const tracker = new DeviceOutageTracker();
    tracker.observe("tv", "connected", false, T0);
    tracker.observe("tv", "disconnected", false, T0);
    tracker.observe("tv", "disconnected", true, T0 + 3 * MINUTE);
    expect(tracker.outages(T0 + 4 * MINUTE)).toEqual([]);
    tracker.observe("tv", "disconnected", false, T0 + 4 * MINUTE);
    expect(tracker.outages(T0 + 5 * MINUTE)).toEqual([]);
    expect(tracker.outages(T0 + 6 * MINUTE)).toHaveLength(1);
  });

  test("orders longest silence first and forgets removed devices", () => {
    const tracker = new DeviceOutageTracker();
    for (const [id, at] of [["a", T0 + MINUTE], ["b", T0]] as const) {
      tracker.observe(id, "connected", false, at);
      tracker.observe(id, "disconnected", false, at);
    }
    expect(tracker.outages(T0 + 10 * MINUTE).map((o) => o.deviceId)).toEqual(["b", "a"]);
    tracker.retainOnly(["a"]);
    expect(tracker.outages(T0 + 10 * MINUTE).map((o) => o.deviceId)).toEqual(["a"]);
  });
});
