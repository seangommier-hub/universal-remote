import { Device } from "../core/types/Device";
import { selectDevicesToImport } from "../runtime/selectDevicesToImport";
import { findDuplicateDevice, isSamePhysicalDevice, stableIdentities } from "./deviceIdentityMatch";

function device(id: string, config: Record<string, unknown> = {}): Device {
  return { id, name: id, category: "tv", manufacturer: "LG", driverId: "lg", capabilities: [], config };
}

describe("stableIdentities", () => {
  test("lower-cases known identifiers and skips blanks and non-strings", () => {
    expect(stableIdentities(device("a", { hwaddr: "AA:BB", uuid: " U-1 ", serial: "", ipAddress: "1.2.3.4" }))).toEqual({ hwaddr: "aa:bb", uuid: "u-1" });
  });
});

describe("isSamePhysicalDevice", () => {
  test("matches on MAC, UUID or serial, case-insensitively", () => {
    expect(isSamePhysicalDevice(device("a", { hwaddr: "AA:BB" }), device("b", { hwaddr: "aa:bb" }))).toBe(true);
    expect(isSamePhysicalDevice(device("a", { uuid: "U1" }), device("b", { uuid: "u1", ipAddress: "9.9.9.9" }))).toBe(true);
    expect(isSamePhysicalDevice(device("a", { serial: "S9" }), device("b", { serial: "s9" }))).toBe(true);
  });

  test("does not match when nothing is shared or one side has no identity", () => {
    expect(isSamePhysicalDevice(device("a", { hwaddr: "aa" }), device("b", { uuid: "aa" }))).toBe(false);
    expect(isSamePhysicalDevice(device("a"), device("b"))).toBe(false);
  });
});

describe("findDuplicateDevice", () => {
  test("finds a re-discovered device after an IP change and ignores the same id", () => {
    const saved = [device("lg-old", { uuid: "u1", ipAddress: "192.168.1.5" })];
    expect(findDuplicateDevice(device("fcc-new", { uuid: "u1", ipAddress: "192.168.1.77" }), saved)?.id).toBe("lg-old");
    expect(findDuplicateDevice(device("lg-old", { uuid: "u1" }), saved)).toBeUndefined();
  });
});

describe("selectDevicesToImport with uuid and serial", () => {
  test("skips a shared device the phone already has under another id, matched by uuid", () => {
    const local = [device("mine", { uuid: "u1" })];
    const shared = [device("theirs", { uuid: "U1" }), device("other", { uuid: "u2" })];
    expect(selectDevicesToImport(shared, local).map((d) => d.id)).toEqual(["other"]);
  });

  test("still skips by id and by hwaddr", () => {
    const local = [device("same"), device("x", { hwaddr: "aa:bb" })];
    const shared = [device("same"), device("y", { hwaddr: "AA:BB" }), device("z")];
    expect(selectDevicesToImport(shared, local).map((d) => d.id)).toEqual(["z"]);
  });
});
