import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadNoticed, MAX_NOTICED_DEVICES, NOTICED_STORAGE_KEY, parseNoticed, saveNoticed, withNoticed } from "./noticedDevices";

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe("parseNoticed", () => {
  test("reads a stored list of keys", () => {
    expect(parseNoticed('["aa:bb","192.168.1.5"]')).toEqual(["aa:bb", "192.168.1.5"]);
  });

  test("returns an empty list for missing, malformed or wrongly shaped data", () => {
    expect(parseNoticed(null)).toEqual([]);
    expect(parseNoticed("not json")).toEqual([]);
    expect(parseNoticed('{"a":1}')).toEqual([]);
  });

  test("drops entries that are not strings", () => {
    expect(parseNoticed('["aa:bb",7,null,{"x":1}]')).toEqual(["aa:bb"]);
  });
});

describe("withNoticed", () => {
  test("adds new keys after the existing ones, each once", () => {
    expect(withNoticed(["a"], ["b", "a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  test("keeps only the newest entries past the cap", () => {
    const full = Array.from({ length: MAX_NOTICED_DEVICES }, (_, index) => `old-${index}`);
    const result = withNoticed(full, ["fresh"]);
    expect(result).toHaveLength(MAX_NOTICED_DEVICES);
    expect(result[result.length - 1]).toBe("fresh");
    expect(result).not.toContain("old-0");
  });
});

describe("storage", () => {
  beforeEach(() => jest.clearAllMocks());

  test("loads what was saved under its own key", async () => {
    storage.getItem.mockResolvedValueOnce('["aa:bb"]');
    await expect(loadNoticed()).resolves.toEqual(["aa:bb"]);
    expect(storage.getItem).toHaveBeenCalledWith(NOTICED_STORAGE_KEY);
  });

  test("a storage failure reads as nothing noticed instead of throwing", async () => {
    storage.getItem.mockRejectedValueOnce(new Error("disk"));
    await expect(loadNoticed()).resolves.toEqual([]);
  });

  test("a storage failure on save does not throw", async () => {
    storage.setItem.mockRejectedValueOnce(new Error("disk"));
    await expect(saveNoticed(["aa:bb"])).resolves.toBeUndefined();
  });

  test("saves the list as JSON", async () => {
    await saveNoticed(["aa:bb"]);
    expect(storage.setItem).toHaveBeenCalledWith(NOTICED_STORAGE_KEY, '["aa:bb"]');
  });
});
