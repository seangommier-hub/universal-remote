// ADR-HEARTH-155: the one framework-free state machine behind every time-boxed pairing step
// (LG/Samsung Allow prompts, Apple TV and PS5 confirmations, the Hue link button). It owns the
// countdown, the retry, the cancel and the brief "Connected!" hold, so no screen keeps its own
// timers and none can leak one.

export const PAIRING_TICK_MS = 1000;
export const PAIRING_CONNECTED_HOLD_MS = 900;

export type PairingSessionState =
  | { phase: "idle" }
  /** `totalMs` is null when the step has no fixed time limit (the countdown is then hidden). */
  | { phase: "waiting"; attempt: number; remainingMs: number; totalMs: number | null }
  | { phase: "connected" }
  | { phase: "failed"; error: unknown }
  | { phase: "cancelled" };

export interface PairingRunContext {
  isCancelled: () => boolean;
  /** A sleep that ends immediately when the session is cancelled, leaving no timer behind. */
  sleep: (ms: number) => Promise<void>;
}

export interface PairingStartOptions<T> {
  /** The real time limit of the step, from the driver's own constant; null for an open-ended step. */
  totalMs: number | null;
  run: (context: PairingRunContext) => Promise<T>;
  /** Called after the "Connected!" hold with the run's result. */
  onDone: (value: T) => void;
  /** Cleans up a result that arrived after the user cancelled (e.g. disconnect a driver). */
  discard?: (value: T) => void;
  /** How long "Connected!" shows before onDone; 0 skips the hold (intermediate steps). */
  connectedHoldMs?: number;
}

type Listener = (state: PairingSessionState) => void;

/** Runs one pairing step at a time with a live countdown, cancel and retry; safe to dispose at any moment. */
export class PairingSession {
  private state: PairingSessionState = { phase: "idle" };
  private listeners = new Set<Listener>();
  private token = 0;
  private attempt = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepers = new Set<{ timer: ReturnType<typeof setTimeout>; resolve: () => void }>();
  private lastStart: PairingStartOptions<unknown> | null = null;
  private heldValue: { value: unknown; options: PairingStartOptions<unknown> } | null = null;

  /** The current state. */
  getState(): PairingSessionState {
    return this.state;
  }

  /** Subscribes to state changes; returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Begins (or restarts) a step; any earlier step is cancelled first. */
  start<T>(options: PairingStartOptions<T>): void {
    this.discardHeldValue();
    this.stopEverything();
    const erased = options as PairingStartOptions<unknown>;
    this.lastStart = erased;
    this.attempt += 1;
    const token = ++this.token;
    const startedAt = Date.now();
    this.setState({ phase: "waiting", attempt: this.attempt, remainingMs: options.totalMs ?? 0, totalMs: options.totalMs });
    if (options.totalMs !== null) this.startCountdown(token, startedAt, options.totalMs);
    options
      .run({ isCancelled: () => token !== this.token, sleep: (ms) => this.sleep(ms, token) })
      .then((value) => this.handleSuccess(token, erased, value))
      .catch((error) => this.handleFailure(token, error));
  }

  /** Re-runs the last step from the beginning. */
  retry(): void {
    if (this.lastStart) this.start(this.lastStart);
  }

  /** Stops the step, its countdown and any pending sleep; a late result is discarded. */
  cancel(): void {
    this.discardHeldValue();
    this.stopEverything();
    this.setState({ phase: "cancelled" });
  }

  /** Cancels without notifying listeners — for unmounting. */
  dispose(): void {
    this.listeners.clear();
    this.discardHeldValue();
    this.stopEverything();
  }

  private startCountdown(token: number, startedAt: number, totalMs: number): void {
    this.tickTimer = setInterval(() => {
      if (token !== this.token || this.state.phase !== "waiting") return;
      const remainingMs = Math.max(0, totalMs - (Date.now() - startedAt));
      this.setState({ ...this.state, remainingMs });
    }, PAIRING_TICK_MS);
  }

  private handleSuccess(token: number, options: PairingStartOptions<unknown>, value: unknown): void {
    if (token !== this.token) {
      options.discard?.(value);
      return;
    }
    this.clearTick();
    this.setState({ phase: "connected" });
    const holdMs = options.connectedHoldMs ?? PAIRING_CONNECTED_HOLD_MS;
    if (holdMs <= 0) return options.onDone(value);
    this.heldValue = { value, options };
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this.heldValue = null;
      options.onDone(value);
    }, holdMs);
  }

  private handleFailure(token: number, error: unknown): void {
    if (token !== this.token) return;
    this.clearTick();
    this.setState({ phase: "failed", error });
  }

  private sleep(ms: number, token: number): Promise<void> {
    if (token !== this.token) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const entry = {
        resolve,
        timer: setTimeout(() => {
          this.sleepers.delete(entry);
          resolve();
        }, ms),
      };
      this.sleepers.add(entry);
    });
  }

  private discardHeldValue(): void {
    if (!this.heldValue) return;
    this.heldValue.options.discard?.(this.heldValue.value);
    this.heldValue = null;
  }

  private stopEverything(): void {
    this.token += 1;
    this.clearTick();
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.sleepers.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.resolve();
    });
    this.sleepers.clear();
  }

  private clearTick(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private setState(next: PairingSessionState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }
}

/** Formats milliseconds as m:ss for the countdown ("0:24"). */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const seconds = totalSeconds % 60;
  return `${Math.floor(totalSeconds / 60)}:${seconds < 10 ? "0" : ""}${seconds}`;
}
