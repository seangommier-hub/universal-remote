import { Activity, ActivityStep, StepResult } from "../src/core/types/Activity";
import { CommandResult } from "../src/core/types/Command";
import { DeviceState } from "../src/core/types/DeviceState";
import { CapabilityId } from "../src/core/types/Capability";
import { TOGGLE_POWER_CAPABILITY, unsupportedHeadlessSteps } from "../src/core/activities/headlessSupport";
import { logger } from "../src/core/logging/logger";
import { ActivityRunResult, runActivity } from "../src/runtime/activityRunner";

// ADR-HEARTH-177: runs one Activity with no phone. Steps the runner may not do unattended are skipped and
// named in the result (never silently dropped); `power` (a toggle) is only sent to a device confirmed on.

const LOG_SCOPE = "RunnerActivity";
const POWER_STATE_MAX_AGE_MS = 90_000;
const MAX_NOTE_LENGTH = 280;
const SKIP_PREFIX = "Skipped: ";
const ALREADY_OFF_NOTE = "Already off, nothing sent";

/** What the activity runner needs from the device executor; the real DeviceExecutor satisfies it. */
export interface ActivityExecutor {
  connect(deviceId: string): Promise<string | null>;
  execute(deviceId: string, capability: CapabilityId, args?: Record<string, unknown>): Promise<CommandResult>;
  getState(deviceId: string): DeviceState | null;
  listDevices(): Array<{ id: string; name: string; driverId: string }>;
}

export interface HeadlessRunOptions {
  runId?: string;
  signal?: AbortSignal;
  now?: () => number;
}

function fail(deviceId: string, capability: CapabilityId, message: string): CommandResult {
  return { success: false, deviceId, capability, timestamp: Date.now(), error: { code: "driver_error", message } };
}

function ok(deviceId: string, capability: CapabilityId): CommandResult {
  return { success: true, deviceId, capability, timestamp: Date.now() };
}

/** Sends `power` only when the device is freshly confirmed on, so a schedule can switch a device off but never turn one on by toggling. */
async function guardedToggle(executor: ActivityExecutor, deviceId: string, args: Record<string, unknown> | undefined, notes: Map<string, string>, now: () => number): Promise<CommandResult> {
  const capability = TOGGLE_POWER_CAPABILITY as CapabilityId;
  const connectError = await executor.connect(deviceId);
  if (connectError) return fail(deviceId, capability, connectError);
  const state = executor.getState(deviceId);
  if (!state || now() - state.lastUpdated > POWER_STATE_MAX_AGE_MS) return fail(deviceId, capability, "Could not confirm whether the device is on, so nothing was sent");
  if (state.values.power === "off") {
    notes.set(`${deviceId}|${capability}`, ALREADY_OFF_NOTE);
    return ok(deviceId, capability);
  }
  if (state.values.power !== "on") return fail(deviceId, capability, "Device did not report on or off, so nothing was sent");
  return executor.execute(deviceId, capability, args);
}

function turnStepIntoNoop(step: ActivityStep): ActivityStep {
  return step.kind === "delay" ? step : { kind: "delay", ms: 0 };
}

function applyNotes(steps: StepResult[], activity: Activity, blocked: Map<number, string>, notes: Map<string, string>): StepResult[] {
  return steps.map((result) => {
    const reason = blocked.get(result.index);
    if (reason) return { index: result.index, status: "skipped", error: `${SKIP_PREFIX}${reason}`.slice(0, MAX_NOTE_LENGTH) };
    const step = activity.steps[result.index];
    const note = step?.kind === "command" && result.status === "ok" ? notes.get(`${step.deviceId}|${step.capability}`) : undefined;
    return note ? { index: result.index, status: "skipped", error: `${SKIP_PREFIX}${note}` } : result;
  });
}

/** Runs the activity through the runner's devices; never throws. Unsupported steps come back skipped with the reason. */
export async function runActivityHeadless(activity: Activity, executor: ActivityExecutor, options: HeadlessRunOptions = {}): Promise<ActivityRunResult> {
  const now = options.now ?? Date.now;
  const drivers = new Map(executor.listDevices().map((device) => [device.id, device.driverId]));
  const blocked = new Map(unsupportedHeadlessSteps(activity, (id) => drivers.get(id)).map(({ index, reason }) => [index, reason]));
  if (blocked.size > 0) logger.warn(LOG_SCOPE, "steps not runnable unattended", { activityId: activity.id, blocked: [...blocked.keys()] });
  const runnable: Activity = { ...activity, steps: activity.steps.map((step, index) => (blocked.has(index) ? turnStepIntoNoop(step) : step)) };
  const notes = new Map<string, string>();
  const result = await runActivity(
    runnable,
    {
      commandEngine: {
        execute: (command) =>
          command.capability === TOGGLE_POWER_CAPABILITY
            ? guardedToggle(executor, command.deviceId, command.args, notes, now)
            : executor.execute(command.deviceId, command.capability, command.args),
      },
      stateStore: { get: (deviceId) => executor.getState(deviceId) ?? { connection: "unknown", values: {}, lastUpdated: 0 } },
    },
    { runId: options.runId, signal: options.signal }
  );
  return { ...result, steps: applyNotes(result.steps, activity, blocked, notes) };
}
