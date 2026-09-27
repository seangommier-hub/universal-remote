import AsyncStorage from "@react-native-async-storage/async-storage";
import { dismissTokenUpgradeBanner, isTokenUpgradeBannerDismissed } from "./tokenUpgradeBannerDismissal";

describe("tokenUpgradeBannerDismissal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("not dismissed until dismissTokenUpgradeBanner is called", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    expect(await isTokenUpgradeBannerDismissed()).toBe(false);
  });

  test("dismissTokenUpgradeBanner records the dismissal", async () => {
    await dismissTokenUpgradeBanner();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.fcc.tokenUpgradeBannerDismissed", "true");
  });

  test("isTokenUpgradeBannerDismissed reads the recorded value back", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("true");
    expect(await isTokenUpgradeBannerDismissed()).toBe(true);
  });
});
