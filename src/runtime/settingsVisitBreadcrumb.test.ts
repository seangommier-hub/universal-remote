import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "../core/logging/logger";
import { finishSettingsVisit, markSettingsVisitStage, reportUnfinishedSettingsVisit } from "./settingsVisitBreadcrumb";

const KEY = "hearth.settingsVisit.v1";

describe("settingsVisitBreadcrumb", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(logger, "error").mockImplementation(() => undefined);
  });

  test("records the stage reached, keeping the time the visit opened", async () => {
    await markSettingsVisitStage("opened", 1000);
    await markSettingsVisitStage("motion-sensor-starting", 1250);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(KEY, JSON.stringify({ openedAt: 1000, stage: "motion-sensor-starting", stageAt: 1250 }));
  });

  test("a visit that closed normally clears the record", async () => {
    await finishSettingsVisit();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(KEY);
  });

  test("an unfinished visit from the last run is logged as an error naming the last stage, then cleared", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ openedAt: 1000, stage: "motion-sensor-starting", stageAt: 1250 }));
    const record = await reportUnfinishedSettingsVisit();
    expect(record?.stage).toBe("motion-sensor-starting");
    expect(logger.error).toHaveBeenCalledWith("SettingsVisit", expect.stringContaining("Settings was open"), expect.objectContaining({ lastStage: "motion-sensor-starting", msFromOpenToLastStage: 250 }));
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(KEY);
  });

  test("nothing is logged when the last run left no record", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    expect(await reportUnfinishedSettingsVisit()).toBeNull();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("a corrupt record is ignored rather than throwing", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("{not json");
    expect(await reportUnfinishedSettingsVisit()).toBeNull();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("a storage failure while recording never throws", async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk full"));
    await expect(markSettingsVisitStage("opened")).resolves.toBeUndefined();
  });
});
