import { buildActivityRun } from "../core/activities/activityRunReport";
import { logger } from "../core/logging/logger";
import { ActivitiesClient } from "../discovery/familyCommandCenterActivities";
import { ActivityRunResult } from "./activityRunner";
import { StepResult } from "../core/types/Activity";

const LOG_SCOPE = "activityRunReporter";

/** Sends a finished run to the Pi's run history; returns false (never throws) when it could not be delivered, since a missed history line must not disturb the run itself. */
export async function reportRun(client: ActivitiesClient, result: ActivityRunResult, steps: StepResult[], by: string | undefined): Promise<boolean> {
  try {
    await client.postRun(buildActivityRun({ ...result, steps }, by));
    return true;
  } catch (err) {
    logger.warn(LOG_SCOPE, "could not report activity run", { runId: result.runId, message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
