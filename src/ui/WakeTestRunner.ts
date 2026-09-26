import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { ConnectionState } from "../core/types/DeviceState";

/** How long a wake test waits for the device to come back before giving up. */
export const WAKE_TEST_TIMEOUT_SECONDS = 60;
const TICK_MS = 1000;
const MS_PER_SECOND = 1000;

export type WakeTestPhase =
  | { kind: "idle" }
  | { kind: "still-on" }
  | { kind: "waiting"; elapsedSeconds: number; remainingSeconds: number }
  | { kind: "success"; seconds: number }
  | { kind: "timeout" }
  | { kind: "send-failed"; message: string };

export interface WakeTestDependencies {
  /** Sends the device's power-on the same way the Power button does; resolves with a failure message or null. */
  sendPowerOn: () => Promise<string | null>;
  readConnection: () => ConnectionState;
  subscribe: (listener: (connection: ConnectionState) => void) => () => void;
  now: () => number;
}

/** State machine for the guided wake test: send power-on, then watch the connection for up to a minute. */
export class WakeTestRunner {
  private phase: WakeTestPhase = { kind: "idle" };
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private startedAt = 0;
  private run = 0;

  constructor(private deps: WakeTestDependencies, private onChange: (phase: WakeTestPhase) => void) {}

  getPhase(): WakeTestPhase {
    return this.phase;
  }

  /** Begins a test; refuses (still-on) when the device already looks connected, since that would prove nothing. */
  async start(): Promise<void> {
    this.stop();
    const run = ++this.run;
    if (this.deps.readConnection() === "connected") return this.setPhase({ kind: "still-on" });
    this.startedAt = this.deps.now();
    this.setPhase({ kind: "waiting", elapsedSeconds: 0, remainingSeconds: WAKE_TEST_TIMEOUT_SECONDS });
    this.unsubscribe = this.deps.subscribe(() => this.check());
    this.timer = setInterval(() => this.check(), TICK_MS);
    const failure = await this.deps.sendPowerOn();
    if (run !== this.run || this.phase.kind !== "waiting") return;
    if (failure) {
      this.stop();
      this.setPhase({ kind: "send-failed", message: failure });
    }
  }

  /** Abandons a running test and returns to idle. */
  cancel(): void {
    this.run++;
    this.stop();
    this.setPhase({ kind: "idle" });
  }

  /** Stops timers and subscriptions without changing the phase; call when the screen goes away. */
  dispose(): void {
    this.run++;
    this.stop();
  }

  private check(): void {
    if (this.phase.kind !== "waiting") return;
    const elapsed = Math.max(0, Math.round((this.deps.now() - this.startedAt) / MS_PER_SECOND));
    if (this.deps.readConnection() === "connected") {
      this.stop();
      return this.setPhase({ kind: "success", seconds: elapsed });
    }
    if (elapsed >= WAKE_TEST_TIMEOUT_SECONDS) {
      this.stop();
      return this.setPhase({ kind: "timeout" });
    }
    this.setPhase({ kind: "waiting", elapsedSeconds: elapsed, remainingSeconds: WAKE_TEST_TIMEOUT_SECONDS - elapsed });
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe?.();
    this.timer = null;
    this.unsubscribe = null;
  }

  private setPhase(next: WakeTestPhase): void {
    this.phase = next;
    this.onChange(next);
  }
}

/** The capability the Power button uses to switch this device on: powerOn when declared, else the toggle power. */
export function powerOnCapability(device: Device): CapabilityId | null {
  if (device.capabilities.includes("powerOn")) return "powerOn";
  return device.capabilities.includes("power") ? "power" : null;
}

/** Wires a runner to the app's real CommandEngine and StateStore, sending power-on the way the Power button does. */
export function createWakeTestDependencies(device: Device, commandEngine: CommandEngine, stateStore: StateStore): WakeTestDependencies {
  return {
    sendPowerOn: async () => {
      const capability = powerOnCapability(device);
      if (!capability) return "This device has no way to be switched on from Hearth.";
      const result = await commandEngine.execute({ deviceId: device.id, capability }, { silent: true });
      return result.success ? null : `Hearth could not send the power-on: ${result.error?.message ?? "unknown reason"}.`;
    },
    readConnection: () => stateStore.get(device.id).connection,
    subscribe: (listener) => stateStore.subscribe(device.id, (state) => listener(state.connection)),
    now: () => Date.now(),
  };
}

/** Plain-language summary of a finished phase for the screen and VoiceOver. */
export function describeWakeResult(phase: WakeTestPhase): string {
  if (phase.kind === "success") return `Woke in ${phase.seconds} s`;
  if (phase.kind === "still-on") return "Hearth still sees it as on. Turn it off with its own remote, wait ten seconds, then test again.";
  if (phase.kind === "send-failed") return phase.message;
  return "";
}
