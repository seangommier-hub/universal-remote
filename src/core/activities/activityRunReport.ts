import { ActivityRun, StepResult } from "../types/Activity";

const DEFAULT_RUNNER_NAME = "someone";
const MINUTES_PAD = 2;
const NOON_HOUR = 12;

/** The wire body for POST activity-runs, built from a finished run's results. */
export function buildActivityRun(
  run: { runId: string; activityId: string; activityName: string; startedAt: string; finishedAt: string; steps: StepResult[] },
  by: string | undefined
): ActivityRun {
  return {
    runId: run.runId,
    activityId: run.activityId,
    activityName: run.activityName,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    by: by?.trim() || DEFAULT_RUNNER_NAME,
    steps: run.steps.map((step) => ({ index: step.index, status: step.status, ...(step.error ? { error: step.error } : {}) })),
  };
}

/** Counts of each outcome in a run's step results. */
export function countStatuses(steps: StepResult[]): { ok: number; failed: number; skipped: number } {
  return {
    ok: steps.filter((s) => s.status === "ok").length,
    failed: steps.filter((s) => s.status === "failed").length,
    skipped: steps.filter((s) => s.status === "skipped").length,
  };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** "1 step failed", "2 steps failed, 1 skipped", or "all steps ok". */
export function summarizeSteps(steps: StepResult[]): string {
  const { failed, skipped } = countStatuses(steps);
  if (failed === 0 && skipped === 0) return "all steps ok";
  const parts: string[] = [];
  if (failed > 0) parts.push(`${plural(failed, "step")} failed`);
  if (skipped > 0) parts.push(failed > 0 ? `${skipped} skipped` : `${plural(skipped, "step")} skipped`);
  return parts.join(", ");
}

/** Local clock time such as "9:02 PM". */
export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  const displayHour = hours % NOON_HOUR === 0 ? NOON_HOUR : hours % NOON_HOUR;
  const minutes = String(date.getMinutes()).padStart(MINUTES_PAD, "0");
  return `${displayHour}:${minutes} ${hours >= NOON_HOUR ? "PM" : "AM"}`;
}

/** One history line: "Movie Night ran 9:02 PM by Leah, 1 step failed". */
export function describeRun(run: ActivityRun): string {
  return `${run.activityName} ran ${formatClockTime(run.finishedAt)} by ${run.by}, ${summarizeSteps(run.steps)}`;
}
