jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadRecentApps, recordAppLaunch } from "./recentAppsPersistence";

function storedValue(): Record<string, string[]> {
  const lastCall = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1);
  return JSON.parse(lastCall[1]);
}

describe("recentAppsPersistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  test("loadRecentApps returns an empty list for a device that's never launched anything", async () => {
    const apps = await loadRecentApps("roku-1");
    expect(apps).toEqual([]);
  });

  test("recordAppLaunch persists the app id at the front of the device's list", async () => {
    await recordAppLaunch("roku-1", "12");
    expect(storedValue()).toEqual({ "roku-1": ["12"] });
  });

  test("a later launch is prepended, most-recent-first", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ "roku-1": ["12"] }));

    await recordAppLaunch("roku-1", "2285");

    expect(storedValue()).toEqual({ "roku-1": ["2285", "12"] });
  });

  test("re-launching an app already in the list moves it to the front instead of duplicating it", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ "roku-1": ["12", "2285", "13"] }));

    await recordAppLaunch("roku-1", "2285");

    expect(storedValue()).toEqual({ "roku-1": ["2285", "12", "13"] });
  });

  test("caps the list at 6 entries, dropping the oldest", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ "roku-1": ["1", "2", "3", "4", "5", "6"] }));

    await recordAppLaunch("roku-1", "7");

    expect(storedValue()).toEqual({ "roku-1": ["7", "1", "2", "3", "4", "5"] });
  });

  test("different devices get independent lists", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ "roku-1": ["12"] }));

    await recordAppLaunch("lg-1", "netflix");

    expect(storedValue()).toEqual({ "roku-1": ["12"], "lg-1": ["netflix"] });
  });

  test("loadRecentApps reflects what was actually persisted", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ "roku-1": ["2285", "12"] }));

    const apps = await loadRecentApps("roku-1");

    expect(apps).toEqual(["2285", "12"]);
  });

  test("a corrupted stored value degrades to an empty list rather than throwing", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("{not valid json");

    const apps = await loadRecentApps("roku-1");

    expect(apps).toEqual([]);
  });
});
