import { randomUUID } from "expo-crypto";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { CommandResult } from "../core/types/Command";
import { Activity, ActivityStep, CommandStep, StepResult, WaitForStep } from "../core/types/Activity";
import { CapabilityId } from "../core/types/Capability";
import { logger } from "../core/logging/logger";

const LOG_SCOPE = "activityRunner";
const WAIT_POLL_INTERVAL_MS = 500;
const RETRY_BACKOFF_STEP_MS = 750;
const RETRY_POLICY_PREFIX = "retry:";

/**
 * Capabilities that toggle or step relative to the device's current state. Re-sending one after a
 * failure that may have already reached the device could flip it back or double the change, so
 * these are never retried automatically (ADR-HEARTH-150) unless the engine call itself threw.
 */
const NON_IDEMPOTENT_CAPABILITIES: ReadonlySet<CapabilityId> = new Set([
  "power",
  "mute",
  "playPause",
  "selectPlayPause",
  "sleepTimer",
  "volumeUp",
  "volumeDown",
  "channelUp",
  "channelDown",
  "openSourceList",
  "dispense",
]);

export interface ActivityRunDeps {
  commandEngine: Pick<CommandEngine, "execute">;
  stateStore: Pick<StateStore, "get">;
}

export interface ActivityRunProgress {
  runId: string;
  index: number;
  total: number;
  phase: "running" | "done";
  status?: StepResult["status"];
}

export interface ActivityRunOptions {
  /** Idempotency key for this run; reused when a run is retried so the Pi upserts instead of duplicating. */
  runId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ActivityRunProgress) => void;
  /** Runs only these step indexes (used to retry failed steps); other steps are left out of the result. */
  onlyIndexes?: number[];
}

export interface ActivityRunResult {
  runId: string;
  activityId: string;
  activityName: string;
  startedAt: string;
  finishedAt: string;
  cancelled: boolean;
  steps: StepResult[];
}

interface StepOutcome {
  result: StepResult;
  halt: boolean;
}

/** Waits `ms`; resolves false if the signal aborts first, true when the full time passed. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function valuesMatch(actual: unknown, expected: unknown): boolean {
  return Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
}

function retriesFor(step: CommandStep): number {
  const policy = step.onFail ?? "continue";
  return policy.startsWith(RETRY_POLICY_PREFIX) ? Number(policy.slice(RETRY_POLICY_PREFIX.length)) : 0;
}

async function tryExecute(step: CommandStep, deps: ActivityRunDeps): Promise<{ result?: CommandResult; thrown?: string }> {
  try {
    return { result: await deps.commandEngine.execute({ deviceId: step.deviceId, capability: step.capability, args: step.args }, { silent: true }) };
  } catch (err) {
    return { thrown: err instanceof Error ? err.message : String(err) };
  }
}

function canRetry(step: CommandStep, attempt: { result?: CommandResult; thrown?: string }): boolean {
  if (attempt.thrown !== undefined) return true;
  return attempt.result?.error?.code === "driver_error" && !NON_IDEMPOTENT_CAPABILITIES.has(step.capability);
}

async function runCommandStep(index: number, step: CommandStep, deps: ActivityRunDeps, signal?: AbortSignal): Promise<StepOutcome> {
  const retries = retriesFor(step);
  let attemptNumber = 0;
  for (;;) {
    const attempt = await tryExecute(step, deps);
    if (attempt.result?.success) return { result: { index, status: "ok" }, halt: false };
    const error = attempt.thrown ?? attempt.result?.error?.message ?? "Unknown error";
    logger.warn(LOG_SCOPE, "command step failed", { deviceId: step.deviceId, capability: step.capability, message: error, attemptNumber });
    const mayRetry = attemptNumber < retries && canRetry(step, attempt) && !signal?.aborted;
    if (!mayRetry) {
      const halt = (step.onFail ?? "continue") !== "continue";
      return { result: { index, status: "failed", error }, halt };
    }
    attemptNumber++;
    if (!(await abortableSleep(RETRY_BACKOFF_STEP_MS * attemptNumber, signal))) return { result: { index, status: "failed", error }, halt: true };
  }
}

async function runWaitForStep(index: number, step: WaitForStep, deps: ActivityRunDeps, signal?: AbortSignal): Promise<StepOutcome> {
  let waited = 0;
  for (;;) {
    if (valuesMatch(deps.stateStore.get(step.deviceId).values[step.stateKey], step.equals)) return { result: { index, status: "ok" }, halt: false };
    if (waited >= step.timeoutMs) break;
    if (!(await abortableSleep(Math.min(WAIT_POLL_INTERVAL_MS, step.timeoutMs - waited), signal))) {
      return { result: { index, status: "skipped" }, halt: true };
    }
    waited += WAIT_POLL_INTERVAL_MS;
  }
  const error = `Timed out after ${Math.round(step.timeoutMs / 1000)}s waiting for ${step.stateKey} to be ${String(step.equals)}`;
  return { result: { index, status: "failed", error }, halt: (step.onTimeout ?? "stop") === "stop" };
}

async function runStep(index: number, step: ActivityStep, deps: ActivityRunDeps, signal?: AbortSignal): Promise<StepOutcome> {
  if (step.kind === "delay") {
    const completed = await abortableSleep(step.ms, signal);
    return { result: { index, status: completed ? "ok" : "skipped" }, halt: !completed };
  }
  if (step.kind === "waitFor") return runWaitForStep(index, step, deps, signal);
  return runCommandStep(index, step, deps, signal);
}

/**
 * Runs an activity's steps strictly in order through the CommandEngine. Never throws: a failing
 * step is recorded and, depending on its policy, either the run continues or every remaining step
 * is marked skipped. Cancelling via `signal` stops immediately and skips the rest.
 */
export async function runActivity(activity: Activity, deps: ActivityRunDeps, options: ActivityRunOptions = {}): Promise<ActivityRunResult> {
  const runId = options.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const wanted = options.onlyIndexes ? new Set(options.onlyIndexes) : undefined;
  const steps: StepResult[] = [];
  let halted = false;
  let cancelled = false;
  for (let index = 0; index < activity.steps.length; index++) {
    if (wanted && !wanted.has(index)) continue;
    if (halted || options.signal?.aborted) {
      cancelled = cancelled || options.signal?.aborted === true;
      steps.push({ index, status: "skipped" });
      halted = true;
      continue;
    }
    options.onProgress?.({ runId, index, total: activity.steps.length, phase: "running" });
    const outcome = await runStep(index, activity.steps[index], deps, options.signal);
    steps.push(outcome.result);
    options.onProgress?.({ runId, index, total: activity.steps.length, phase: "done", status: outcome.result.status });
    if (options.signal?.aborted) cancelled = true;
    if (outcome.halt) halted = true;
  }
  return { runId, activityId: activity.id, activityName: activity.name, startedAt, finishedAt: new Date().toISOString(), cancelled, steps };
}

/** Indexes worth re-running after a run: steps that failed plus steps that never ran (skipped after a stop or cancel). */
export function retryableIndexes(steps: StepResult[]): number[] {
  return steps.filter((step) => step.status !== "ok").map((step) => step.index);
}

/** Replaces the earlier result of every step a retry re-ran, keeping the untouched ones, ordered by index. */
export function mergeRetryResults(previous: StepResult[], retry: StepResult[]): StepResult[] {
  const byIndex = new Map(previous.map((step) => [step.index, step]));
  retry.forEach((step) => byIndex.set(step.index, step));
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}
