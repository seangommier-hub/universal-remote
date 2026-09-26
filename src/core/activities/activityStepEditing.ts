import { Activity, ActivityStep, DelayStep, StepFailurePolicy, WaitForStep } from "../types/Activity";
import { ACTIVITY_MAX_STEPS, DEFAULT_DELAY_MS, DEFAULT_WAIT_TIMEOUT_MS, DELAY_MAX_MS, DELAY_MIN_MS } from "./activityLimits";
import { clampNumber } from "./activityModel";
import { WAIT_CONDITIONS } from "./activityChoices";

export const FAILURE_POLICY_CYCLE: readonly StepFailurePolicy[] = ["continue", "stop", "retry:1", "retry:2", "retry:3"];

/** Appends a step unless the activity is already at the step limit. */
export function appendStep(steps: ActivityStep[], step: ActivityStep): ActivityStep[] {
  return steps.length >= ACTIVITY_MAX_STEPS ? steps : [...steps, step];
}

/** Removes the step at `index`; an out-of-range index changes nothing. */
export function removeStepAt(steps: ActivityStep[], index: number): ActivityStep[] {
  return steps.filter((_, i) => i !== index);
}

/** Swaps the step at `index` with its neighbour above (-1) or below (+1); at an edge nothing changes. */
export function moveStep(steps: ActivityStep[], index: number, direction: -1 | 1): ActivityStep[] {
  const target = index + direction;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Replaces the step at `index` with an updated copy. */
export function replaceStep(steps: ActivityStep[], index: number, step: ActivityStep): ActivityStep[] {
  return steps.map((existing, i) => (i === index ? step : existing));
}

/** A delay step with the default duration. */
export function newDelayStep(): DelayStep {
  return { kind: "delay", ms: DEFAULT_DELAY_MS };
}

/** A "wait until this device is on" step with the default timeout. */
export function newWaitStep(deviceId: string): WaitForStep {
  const [first] = WAIT_CONDITIONS;
  return { kind: "waitFor", deviceId, stateKey: first.stateKey, equals: first.equals, timeoutMs: DEFAULT_WAIT_TIMEOUT_MS };
}

/** Returns a delay step with its duration nudged by `deltaMs`, kept within the contract's limits. */
export function nudgeDelay(step: DelayStep, deltaMs: number): DelayStep {
  return { ...step, ms: clampNumber(step.ms + deltaMs, DELAY_MIN_MS, DELAY_MAX_MS) };
}

/** Moves a waitFor step to the next preset condition (on -> off -> on). */
export function cycleWaitCondition(step: WaitForStep): WaitForStep {
  const current = WAIT_CONDITIONS.findIndex((c) => c.stateKey === step.stateKey && c.equals === step.equals);
  const next = WAIT_CONDITIONS[(current + 1) % WAIT_CONDITIONS.length];
  return { ...step, stateKey: next.stateKey, equals: next.equals };
}

/** Advances a command step's failure policy through continue, stop, retry 1..3. */
export function nextFailurePolicy(current: StepFailurePolicy | undefined): StepFailurePolicy {
  const index = FAILURE_POLICY_CYCLE.indexOf(current ?? "continue");
  return FAILURE_POLICY_CYCLE[(index + 1) % FAILURE_POLICY_CYCLE.length];
}

/** A short label for a failure policy. */
export function describeFailurePolicy(policy: StepFailurePolicy | undefined): string {
  if (!policy || policy === "continue") return "If it fails: keep going";
  if (policy === "stop") return "If it fails: stop";
  return `If it fails: retry ${policy.slice("retry:".length)}x`;
}

/** Builds a brand-new, never-synced activity draft. */
export function newActivityDraft(id: string, name: string, steps: ActivityStep[], nowIso: string): Activity {
  return { id, name: name.trim(), steps, version: 0, updatedAt: nowIso };
}
