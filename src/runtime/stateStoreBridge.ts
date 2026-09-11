import { DeviceDriver } from "../core/drivers/DeviceDriver";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";

/**
 * Wires one driver's own state notifications into the shared StateStore the UI actually reads.
 *
 * Real-hardware finding (2026-09-10): every driver correctly implements subscribeToState() and
 * getState(), and is tested against them — but nothing in the app ever called subscribeToState().
 * UniversalTvRemote's status pill and reconnect banner read only from StateStore, which was
 * previously updated solely by CommandEngine's incidental patch() after a successful command
 * (which defaults its `connection` argument to "connected" regardless of the device's actual
 * state). A driver's own connect()/disconnect()/auto-reconnect state changes — this session's
 * entire ADR-HEARTH-017 reliability effort — never reached the UI at all: a device could be
 * mid-backoff-retry, truly disconnected, with the screen still showing stale "Connected" from the
 * last successful button press, or showing "unknown"/disconnected immediately after a fresh
 * connect() that the shared store was never told about.
 *
 * Subscribes before reading current state, not after, so a state change landing between the two
 * calls can't be missed. Returns the unsubscribe function so a removed device's listener doesn't
 * leak past the device it belonged to.
 *
 * Real-hardware finding (2026-09-10), Sean directly: "i have ALLOWED IT like 15 times, i don't
 * want to again." Traced: a driver's own autonomous background retry (LgWebOsDriver's
 * scheduleReconnect, and its Samsung/Hue equivalents) calls its own connect() directly — never
 * through App.tsx's handleReconnect wrapper, which is the only place that re-persists
 * device.config after a successful connect. A pairing key learned that way (as opposed to a
 * manual "Reconnect" tap) lived only in memory: correct until the next reload, then gone,
 * demanding the on-screen prompt all over again. This is the one place every reconnect path —
 * manual, automatic, initial app load, MAC re-discovery — already converges (all of them end in
 * the same setState(..., {connection: "connected"})), so it's the single point that can catch
 * all of them uniformly instead of teaching four different drivers about persistence. Fires
 * `onConnected` only on an actual disconnected/unknown -> connected transition, not on every
 * state update while already connected (most commands re-emit "connected" on success) — a
 * config-bearing device could be paired again in seconds; there's no reason to write to
 * SecureStore on every single button press.
 */
export function bridgeDeviceState(driver: DeviceDriver, device: Device, stateStore: StateStore, onConnected?: (device: Device) => void): () => void {
  // `initialized` guards whichever of getState()'s seed or subscribeToState's first live event
  // arrives first from being treated as a "transition" — a device that's already connected at
  // wiring time (e.g. one just added through its own pairing screen) isn't reconnecting, so it
  // shouldn't fire onConnected. Only a later disconnected -> connected change, after a baseline
  // is established, counts.
  let initialized = false;
  let wasConnected = false;
  function handle(state: DeviceState): void {
    const isConnected = state.connection === "connected";
    if (initialized && isConnected && !wasConnected) onConnected?.(device);
    wasConnected = isConnected;
    initialized = true;
  }
  const unsubscribe = driver.subscribeToState(device, (deviceId, state) => {
    stateStore.set(deviceId, state);
    handle(state);
  });
  driver.getState(device).then((state) => {
    stateStore.set(device.id, state);
    handle(state);
  });
  return unsubscribe;
}
