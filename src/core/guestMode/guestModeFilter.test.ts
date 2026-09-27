import { Device } from "../types/Device";
import { devicesVisibleToGuest, toggleGuestAllowed } from "./guestModeFilter";

const device = (id: string): Device => ({ id, name: id, category: "tv", manufacturer: "X", driverId: "d", capabilities: [] });

describe("devicesVisibleToGuest", () => {
  const devices = [device("a"), device("b"), device("c")];

  test("shows every device when not a guest, regardless of the allowed list", () => {
    expect(devicesVisibleToGuest(devices, ["a"], false)).toHaveLength(3);
  });

  test("shows only the guest-allowed devices when this phone is a guest", () => {
    const visible = devicesVisibleToGuest(devices, ["b"], true);
    expect(visible.map((d) => d.id)).toEqual(["b"]);
  });

  test("a guest with an empty allowed list sees nothing -- never leaks the rest of the household", () => {
    expect(devicesVisibleToGuest(devices, [], true)).toEqual([]);
  });

  test("an allowed id that no longer exists among devices is silently ignored, not a leak of anything else", () => {
    expect(devicesVisibleToGuest(devices, ["gone", "a"], true).map((d) => d.id)).toEqual(["a"]);
  });
});

describe("toggleGuestAllowed", () => {
  test("adds a device not yet on the list", () => {
    expect(toggleGuestAllowed([], "a")).toEqual(["a"]);
  });

  test("removes a device already on the list", () => {
    expect(toggleGuestAllowed(["a", "b"], "a")).toEqual(["b"]);
  });
});
