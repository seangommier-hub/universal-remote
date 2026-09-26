import { CapabilityId } from "./Capability";

/** How a failed command step reacts: keep going, stop the run, or retry up to N more times (ADR-HEARTH-150). */
export type StepFailurePolicy = "continue" | "stop" | "retry:1" | "retry:2" | "retry:3";

/** What a waitFor step does when its state never arrives in time. */
export type StepTimeoutPolicy = "continue" | "stop";

/** Runs one capability on one device; `args` only for capabilities that need one (inputSelection, launchApp, setVolume). */
export interface CommandStep {
  kind: "command";
  deviceId: string;
  capability: CapabilityId;
  args?: Record<string, unknown>;
  onFail?: StepFailurePolicy;
}

/** Pauses the run for a fixed time (e.g. let a TV finish booting). */
export interface DelayStep {
  kind: "delay";
  ms: number;
}

/** Holds the run until a device's live state value equals `equals`, or `timeoutMs` passes. */
export interface WaitForStep {
  kind: "waitFor";
  deviceId: string;
  stateKey: string;
  equals: unknown;
  timeoutMs: number;
  onTimeout?: StepTimeoutPolicy;
}

export type ActivityStep = CommandStep | DelayStep | WaitForStep;

/** A named, ordered, household-shared sequence of steps, e.g. "Movie Night" (ADR-HEARTH-150). `version` is the last server version this copy is based on (0 = never synced). */
export interface Activity {
  id: string;
  name: string;
  icon?: string;
  steps: ActivityStep[];
  version: number;
  updatedAt: string;
  updatedBy?: string;
}

/** A schedule the Family Command Center fires on its own. */
export interface ActivityTrigger {
  id: string;
  activityId: string;
  kind: "time";
  at: string;
  days: number[];
  enabled: boolean;
}

export type StepStatus = "ok" | "failed" | "skipped";

/** Outcome of one step of a run. */
export interface StepResult {
  index: number;
  status: StepStatus;
  error?: string;
}

/** Everything a finished run reports to Family Command Center (POST activity-runs). */
export interface ActivityRun {
  runId: string;
  activityId: string;
  activityName: string;
  startedAt: string;
  finishedAt: string;
  by: string;
  steps: StepResult[];
}
