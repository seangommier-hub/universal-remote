import { CapabilityId, StreamingService } from "../types/Capability";
import { Device } from "../types/Device";
import { ActivityStep, CommandStep } from "../types/Activity";

export const CAPABILITY_LABELS: Partial<Record<CapabilityId, string>> = {
  power: "Power",
  powerOn: "Power On",
  powerOff: "Power Off",
  volumeUp: "Volume Up",
  volumeDown: "Volume Down",
  setVolume: "Set Volume",
  mute: "Mute",
  channelUp: "Channel Up",
  channelDown: "Channel Down",
  select: "Select",
  back: "Back",
  home: "Home",
  menu: "Menu",
  sleepTimer: "Sleep Timer",
  settings: "Settings",
  openSourceList: "Source",
  playPause: "Play/Pause",
  play: "Play",
  pause: "Pause",
};

/** Capabilities that need no argument, so a step can be a single tap. */
export const NO_ARG_CAPABILITIES: ReadonlySet<CapabilityId> = new Set([
  "power",
  "powerOn",
  "powerOff",
  "volumeUp",
  "volumeDown",
  "mute",
  "channelUp",
  "channelDown",
  "select",
  "back",
  "home",
  "menu",
  "sleepTimer",
  "settings",
  "openSourceList",
  "playPause",
  "play",
  "pause",
]);

export const STREAMING_SERVICE_LABELS: Record<StreamingService, string> = {
  netflix: "Netflix",
  hulu: "Hulu",
  primeVideo: "Prime Video",
  youtube: "YouTube",
};

export const VOLUME_PRESETS: readonly number[] = [10, 20, 30, 40, 50, 60];

export interface InputOption {
  id: string;
  label: string;
}

/** One thing a device can do as a step, with the arguments that make it concrete. */
export interface StepChoice {
  key: string;
  label: string;
  capability: CapabilityId;
  args?: Record<string, unknown>;
}

/** True when a live state value is a usable list of selectable inputs. */
export function isInputOptionArray(value: unknown): value is InputOption[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "object" && entry !== null && typeof (entry as InputOption).id === "string");
}

function choice(capability: CapabilityId, label: string, args?: Record<string, unknown>): StepChoice {
  return { key: `${capability}:${JSON.stringify(args ?? {})}`, label, capability, args };
}

/** Everything a device can be asked to do in a step, driven by the capabilities it declares (inputs come from its live state). */
export function commandChoicesFor(device: Device, liveInputs: unknown): StepChoice[] {
  const choices: StepChoice[] = device.capabilities
    .filter((capability) => NO_ARG_CAPABILITIES.has(capability))
    .map((capability) => choice(capability, CAPABILITY_LABELS[capability] ?? capability));
  if (device.capabilities.includes("setVolume")) {
    VOLUME_PRESETS.forEach((volume) => choices.push(choice("setVolume", `Volume ${volume}`, { volume })));
  }
  if (device.capabilities.includes("inputSelection") && isInputOptionArray(liveInputs)) {
    liveInputs.forEach((option) => choices.push(choice("inputSelection", `Input: ${option.label}`, { input: option.id })));
  }
  if (device.capabilities.includes("launchApp")) {
    (Object.keys(STREAMING_SERVICE_LABELS) as StreamingService[]).forEach((service) =>
      choices.push(choice("launchApp", `Launch ${STREAMING_SERVICE_LABELS[service]}`, { service }))
    );
  }
  return choices;
}

/** The waitFor conditions offered in the editor; power is the state every driver reports. */
export const WAIT_CONDITIONS: readonly { key: string; label: string; stateKey: string; equals: unknown }[] = [
  { key: "power-on", label: "is on", stateKey: "power", equals: "on" },
  { key: "power-off", label: "is off", stateKey: "power", equals: "off" },
];

/** Builds a command step from a picked choice. */
export function commandStepFromChoice(deviceId: string, picked: StepChoice): CommandStep {
  const step: CommandStep = { kind: "command", deviceId, capability: picked.capability };
  if (picked.args) step.args = picked.args;
  return step;
}

function deviceName(devices: Device[], deviceId: string): string {
  return devices.find((d) => d.id === deviceId)?.name ?? "Unknown device";
}

function describeCommand(step: CommandStep, name: string, liveInputs: unknown): string {
  if (step.capability === "inputSelection") {
    const match = isInputOptionArray(liveInputs) ? liveInputs.find((o) => o.id === step.args?.input) : undefined;
    return `${name}: input ${match?.label ?? String(step.args?.input ?? "")}`.trim();
  }
  if (step.capability === "launchApp") {
    const service = step.args?.service as StreamingService | undefined;
    return `${name}: launch ${(service && STREAMING_SERVICE_LABELS[service]) ?? String(service ?? "app")}`;
  }
  if (step.capability === "setVolume") return `${name}: volume ${String(step.args?.volume ?? "")}`.trim();
  return `${name}: ${CAPABILITY_LABELS[step.capability] ?? step.capability}`;
}

/** A one-line plain-language description of a step for lists and results. */
export function describeStep(step: ActivityStep, devices: Device[], inputsOf: (deviceId: string) => unknown): string {
  if (step.kind === "delay") return `Wait ${step.ms / 1000}s`;
  const name = deviceName(devices, step.deviceId);
  if (step.kind === "waitFor") {
    const condition = WAIT_CONDITIONS.find((c) => c.stateKey === step.stateKey && c.equals === step.equals);
    return `Wait until ${name} ${condition?.label ?? `${step.stateKey} = ${String(step.equals)}`}`;
  }
  return describeCommand(step, name, inputsOf(step.deviceId));
}
