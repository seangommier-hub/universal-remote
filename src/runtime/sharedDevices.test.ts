import { Device } from "../core/types/Device";
import { isShared, markShared, selectSharedDevices } from "./sharedDevices";

function device(id: string, shared?: boolean): Device {
  return { id, name: id, category: "tv", manufacturer: "LG", driverId: "lg", capabilities: [], config: {}, shared };
}

describe("sharedDevices", () => {
  test("a device with no flag is shared, so devices saved before this feature keep syncing", () => {
    expect(isShared(device("a"))).toBe(true);
  });

  test("only an explicit false keeps a device off the household list", () => {
    expect(selectSharedDevices([device("a", true), device("b", false), device("c")]).map((d) => d.id)).toEqual(["a", "c"]);
  });

  test("a device received from another phone is marked shared", () => {
    expect(markShared(device("a", false)).shared).toBe(true);
  });
});
