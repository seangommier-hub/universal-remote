import { Activity, ActivityStep } from "../types/Activity";

// ADR-HEARTH-177: which steps the Family Command Center may run unattended (a scheduled run has no phone).
// The runner and the editor both read this list, so the warning a person sees is exactly what the Pi will do.

/** Driver ids the headless runner is allowed to drive on a schedule. Extend only after a live check. */
export const HEADLESS_DRIVER_IDS: ReadonlySet<string> = new Set(["lg-webos-wss3001", "sony-bravia", "roku-ecp", "kasa-plug", "shelly-relay"]);

/** Unattended runs only switch things off, plus launchApp (ADR-HEARTH-206: this allow-list is
 * also what gates a physical remote's button-event execution, adr/0257 on the Pi -- a button
 * press is never actually unattended, someone is standing at the remote, but it reuses this exact
 * shared runner/allow-list rather than a second execution path. Opening an app is low-risk and
 * reversible, unlike most other capabilities this list still excludes). `power` is a toggle, so
 * the runner also confirms the device is on first. */
export const HEADLESS_COMMAND_CAPABILITIES: ReadonlySet<string> = new Set(["powerOff", "power", "launchApp"]);

/** The capability whose command flips the current state, and therefore needs an "is on" check first. */
export const TOGGLE_POWER_CAPABILITY = "power";

export interface UnsupportedStep {
  index: number;
  reason: string;
}

/** Why a step cannot run unattended, or null when it can. `driverIdOf` returns undefined for a device the Pi does not know. */
export function headlessProblem(step: ActivityStep, driverIdOf: (deviceId: string) => string | undefined): string | null {
  if (step.kind === "delay") return null;
  const driverId = driverIdOf(step.deviceId);
  if (driverId === undefined) return "device is not known to the Pi";
  if (!HEADLESS_DRIVER_IDS.has(driverId)) return `${driverId} devices cannot run on a schedule yet`;
  if (step.kind === "command" && !HEADLESS_COMMAND_CAPABILITIES.has(step.capability)) return `${step.capability} cannot run on a schedule yet (only power off)`;
  return null;
}

/** Every step of the activity that would be skipped on a schedule, with the reason. */
export function unsupportedHeadlessSteps(activity: Activity, driverIdOf: (deviceId: string) => string | undefined): UnsupportedStep[] {
  const problems: UnsupportedStep[] = [];
  activity.steps.forEach((step, index) => {
    const reason = headlessProblem(step, driverIdOf);
    if (reason) problems.push({ index, reason });
  });
  return problems;
}
