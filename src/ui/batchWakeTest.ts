import { Device } from "../core/types/Device";
import { powerOnCapability, WakeTestDependencies, WakeTestPhase, WakeTestRunner } from "./WakeTestRunner";

// ADR-HEARTH-195: "Test wake for all" on the post-"Add all" summary reuses WakeTestRunner's own
// send/watch state machine per device instead of duplicating it, running one device at a time (the
// same one-at-a-time rationale as "Add all" itself, ADR-HEARTH-167 — a burst of wake packets and
// state subscriptions would race on the Pi otherwise) and reporting a pass/fail/skip per row.

export type BatchWakeRowStatus = "waiting" | "testing" | "pass" | "fail" | "skip";

export interface BatchWakeRowResult {
  status: BatchWakeRowStatus;
  /** Plain-language detail: the seconds it took, why it was skipped, or why it failed. */
  message?: string;
}

export interface BatchWakeHooks {
  onStatus: (deviceId: string, result: BatchWakeRowResult) => void;
}

const NO_POWER_ON_MESSAGE = "No power-on command for this device.";
const ALREADY_ON_MESSAGE = "Already on — skipped.";
const TIMEOUT_MESSAGE = "Didn't wake in time.";

/** True when a device declares a way to be switched on, so a wake test has something to send. */
export function canBatchWakeTest(device: Device): boolean {
  return powerOnCapability(device) !== null;
}

/** Runs one device's wake test to a terminal phase (never "waiting"/"idle") and resolves with it. */
function runToCompletion(deps: WakeTestDependencies): Promise<WakeTestPhase> {
  return new Promise((resolve) => {
    const runner: WakeTestRunner = new WakeTestRunner(deps, (phase) => {
      if (phase.kind === "waiting" || phase.kind === "idle") return;
      runner.dispose();
      resolve(phase);
    });
    void runner.start();
  });
}

function resultFor(phase: WakeTestPhase): BatchWakeRowResult {
  if (phase.kind === "success") return { status: "pass", message: `Woke in ${phase.seconds} s` };
  if (phase.kind === "still-on") return { status: "skip", message: ALREADY_ON_MESSAGE };
  if (phase.kind === "send-failed") return { status: "fail", message: phase.message };
  return { status: "fail", message: TIMEOUT_MESSAGE };
}

/**
 * Tests every device that can be tested, one at a time and in the given order; a device with no
 * power-on path is skipped immediately without ever touching the network.
 */
export async function runBatchWakeTest(devices: Device[], depsFor: (device: Device) => WakeTestDependencies, hooks: BatchWakeHooks): Promise<void> {
  devices.forEach((device) => hooks.onStatus(device.id, { status: "waiting" }));
  for (const device of devices) {
    if (!canBatchWakeTest(device)) {
      hooks.onStatus(device.id, { status: "skip", message: NO_POWER_ON_MESSAGE });
      continue;
    }
    hooks.onStatus(device.id, { status: "testing" });
    const phase = await runToCompletion(depsFor(device));
    hooks.onStatus(device.id, resultFor(phase));
  }
}
