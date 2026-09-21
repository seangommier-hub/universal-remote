// Universal sleep timer (2026-09-20, Sean directly: "there should be a method for a sleep
// function on any tv to be easily activated"). Samsung's own native "sleepTimer" capability
// (KEY_SLEEP, cycling the TV's own on-screen presets) stays exactly as it already is — a real,
// working, device-native mechanism. This is the separate, universal fallback for every other TV:
// rather than requiring each brand's own protocol to expose a real sleep-timer command (most
// don't — see Capability.ts's own sleepTimer research note), a plain client-side countdown that
// calls whatever power-off mechanism the device already has (power/powerOff/Wake-on-LAN combo)
// once it expires works identically regardless of brand, the same way a household member falling
// asleep in front of any TV, smart or not, already expects "it turns itself off eventually."
//
// Deliberately NOT persisted across an app relaunch or force-quit — a plain in-memory timer, same
// honest scope as this project's other non-persisted timers (e.g. LG/Samsung's own reconnect
// backoff counters). Surviving a backgrounded-but-not-killed app is the real, useful case (falling
// asleep with the phone screen off nearby); surviving a full app kill would need a real scheduled
// local notification, a bigger feature not built here.

export interface SleepTimerState {
  deviceId: string;
  expiresAt: number;
}

type Listener = (state: SleepTimerState | null) => void;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const expirations = new Map<string, number>();
const listeners = new Map<string, Set<Listener>>();

function notify(deviceId: string): void {
  const state: SleepTimerState | null = expirations.has(deviceId) ? { deviceId, expiresAt: expirations.get(deviceId)! } : null;
  listeners.get(deviceId)?.forEach((listener) => listener(state));
}

/** Starts (or replaces) a sleep timer for one device — calls `onExpire` once `minutes` elapses. */
export function startSleepTimer(deviceId: string, minutes: number, onExpire: () => void): void {
  cancelSleepTimer(deviceId);
  const durationMs = minutes * 60_000;
  expirations.set(deviceId, Date.now() + durationMs);
  const timer = setTimeout(() => {
    timers.delete(deviceId);
    expirations.delete(deviceId);
    notify(deviceId);
    onExpire();
  }, durationMs);
  timers.set(deviceId, timer);
  notify(deviceId);
}

/** Cancels a device's sleep timer, if one is running. Harmless no-op otherwise. */
export function cancelSleepTimer(deviceId: string): void {
  const timer = timers.get(deviceId);
  if (timer) clearTimeout(timer);
  timers.delete(deviceId);
  if (expirations.delete(deviceId)) notify(deviceId);
}

/** The epoch-ms time a device's sleep timer will fire, or undefined if none is running. */
export function getSleepTimerExpiration(deviceId: string): number | undefined {
  return expirations.get(deviceId);
}

/** Subscribes to a device's sleep timer state (fires on start/cancel/expire). Returns an unsubscribe function. */
export function subscribeSleepTimer(deviceId: string, listener: Listener): () => void {
  const set = listeners.get(deviceId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(deviceId, set);
  return () => set.delete(listener);
}
