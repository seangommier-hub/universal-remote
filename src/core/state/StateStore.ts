import { createUnknownState, DeviceState } from "../types/DeviceState";

type Listener = (state: DeviceState) => void;

/** In-memory last-known state for every device, with subscriptions so UI can re-render on change. */
export class StateStore {
  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<Listener>>();

  get(deviceId: string): DeviceState {
    return this.states.get(deviceId) ?? createUnknownState();
  }

  set(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(state));
  }

  /** Merges a partial values patch into the existing state, preserving unrelated fields — commands usually only report what they changed. */
  patch(deviceId: string, patch: Partial<DeviceState["values"]>, connection: DeviceState["connection"] = "connected"): void {
    const current = this.get(deviceId);
    this.set(deviceId, {
      connection,
      values: { ...current.values, ...patch },
      lastUpdated: Date.now(),
    });
  }

  subscribe(deviceId: string, listener: Listener): () => void {
    const set = this.listeners.get(deviceId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(deviceId, set);
    return () => set.delete(listener);
  }
}
