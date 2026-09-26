import { reportRun } from "./activityRunReporter";
import { ActivitiesClient } from "../discovery/familyCommandCenterActivities";
import { ActivityRunResult } from "./activityRunner";

const RESULT: ActivityRunResult = { runId: "run-1", activityId: "a", activityName: "A", startedAt: "s", finishedAt: "f", cancelled: false, steps: [] };

test("posts the run with the merged steps and the runner's name", async () => {
  const postRun = jest.fn(async () => undefined);
  const delivered = await reportRun({ postRun } as unknown as ActivitiesClient, RESULT, [{ index: 0, status: "ok" }], "Leah");
  expect(delivered).toBe(true);
  expect(postRun).toHaveBeenCalledWith({ runId: "run-1", activityId: "a", activityName: "A", startedAt: "s", finishedAt: "f", by: "Leah", steps: [{ index: 0, status: "ok" }] });
});

test("a failed post is swallowed and reported as not delivered", async () => {
  const postRun = jest.fn(async () => {
    throw new Error("offline");
  });
  expect(await reportRun({ postRun } as unknown as ActivitiesClient, RESULT, [], undefined)).toBe(false);
});
