import AsyncStorage from "@react-native-async-storage/async-storage";
import { dismissDefaultActivitiesOffer, isDefaultActivitiesOfferDismissed } from "./defaultActivitiesOfferDismissal";

describe("defaultActivitiesOfferDismissal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("not dismissed until dismissDefaultActivitiesOffer is called", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    expect(await isDefaultActivitiesOfferDismissed()).toBe(false);
  });

  test("dismissDefaultActivitiesOffer records the dismissal", async () => {
    await dismissDefaultActivitiesOffer();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.activities.defaultActivitiesOfferDismissed", "true");
  });

  test("isDefaultActivitiesOfferDismissed reads the recorded value back", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("true");
    expect(await isDefaultActivitiesOfferDismissed()).toBe(true);
  });
});
