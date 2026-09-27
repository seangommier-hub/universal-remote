jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { emptyLayout } from "../core/layout/deviceLayout";
import { loadDeviceLayout, saveDeviceLayout } from "./deviceLayoutPersistence";

describe("deviceLayoutPersistence", () => {
  beforeEach(() => jest.clearAllMocks());

  test("a phone that never saved a layout gets an empty one", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    expect(await loadDeviceLayout()).toEqual(emptyLayout());
  });

  test("damaged stored text falls back to an empty layout instead of throwing", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("{not json");
    expect(await loadDeviceLayout()).toEqual(emptyLayout());
  });

  test("a layout saved without newer fields loads with those fields empty", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ favorites: ["a"] }));
    expect(await loadDeviceLayout()).toEqual({ rooms: {}, favorites: ["a"], order: [], collapsedRooms: [], kidAllowed: [], guestAllowed: [] });
  });

  test("save then load round-trips", async () => {
    const layout = { rooms: { a: "Den" }, favorites: ["a"], order: ["b", "a"], collapsedRooms: ["den"], kidAllowed: ["b"], guestAllowed: ["a"] };
    await saveDeviceLayout(layout);
    const [, stored] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(stored);
    expect(await loadDeviceLayout()).toEqual(layout);
  });
});
