import { Device } from "../core/types/Device";
import { evaluateAutoCheck } from "./PostAddAutoChecks";
import { parseWakeTestRecords } from "./WakeTestStore";

const device: Device = { id: "tv", name: "TV", category: "tv", manufacturer: "LG", driverId: "d", capabilities: ["powerOn"], config: { hwaddr: "aa:bb:cc:dd:ee:ff" } };

describe("evaluateAutoCheck", () => {
  it("passes mac-known when a MAC is saved and fails with a reason when not", () => {
    expect(evaluateAutoCheck("mac-known", { device, fcc: "ok", connection: "unknown" })?.ok).toBe(true);
    const missing = evaluateAutoCheck("mac-known", { device: { ...device, config: {} }, fcc: "ok", connection: "unknown" });
    expect(missing).toEqual({ ok: false, reason: expect.stringContaining("No MAC") });
  });

  it("maps every Family Command Center probe outcome", () => {
    const run = (fcc: "pending" | "ok" | "not-configured" | "unreachable") => evaluateAutoCheck("fcc-reachable", { device, fcc, connection: "unknown" });
    expect(run("pending")).toBeNull();
    expect(run("ok")?.ok).toBe(true);
    expect(run("not-configured")?.reason).toMatch(/isn't connected/);
    expect(run("unreachable")?.reason).toMatch(/Couldn't reach/);
  });

  it("uses the connection state for device-answers", () => {
    expect(evaluateAutoCheck("device-answers", { device, fcc: "ok", connection: "connected" })?.ok).toBe(true);
    expect(evaluateAutoCheck("device-answers", { device, fcc: "ok", connection: "disconnected" })?.ok).toBe(false);
  });
});

describe("parseWakeTestRecords", () => {
  it("reads a stored map and treats malformed data as empty", () => {
    expect(parseWakeTestRecords('{"tv":{"testedAt":1,"seconds":9}}')).toEqual({ tv: { testedAt: 1, seconds: 9 } });
    expect(parseWakeTestRecords("not json")).toEqual({});
    expect(parseWakeTestRecords("[1]")).toEqual({});
    expect(parseWakeTestRecords(null)).toEqual({});
  });
});
