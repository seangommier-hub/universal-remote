import { Device } from "../core/types/Device";
import { selectDevicesToImport } from "./selectDevicesToImport";

function device(id: string, hwaddr?: string): Device {
  return { id, name: id, category: "tv", manufacturer: "LG", driverId: "lg", capabilities: [], config: hwaddr ? { hwaddr } : {} };
}

describe("selectDevicesToImport", () => {
  test("imports every shared device when this phone has none", () => {
    expect(selectDevicesToImport([device("a"), device("b")], []).map((d) => d.id)).toEqual(["a", "b"]);
  });

  test("skips a device already present by id, keeping the local copy", () => {
    expect(selectDevicesToImport([device("a"), device("b")], [device("a")]).map((d) => d.id)).toEqual(["b"]);
  });

  test("skips a device already present under a different id but the same hardware address, ignoring case", () => {
    const shared = [device("fcc-1", "AA:BB:CC:DD:EE:FF")];
    const local = [device("lg-local", "aa:bb:cc:dd:ee:ff")];
    expect(selectDevicesToImport(shared, local)).toEqual([]);
  });

  test("devices with no hardware address are only matched by id", () => {
    expect(selectDevicesToImport([device("x")], [device("y")]).map((d) => d.id)).toEqual(["x"]);
  });
});
