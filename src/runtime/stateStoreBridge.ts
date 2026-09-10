import { DeviceDriver } from "../core/drivers/DeviceDriver";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";

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
 */
export function bridgeDeviceState(driver: DeviceDriver, device: Device, stateStore: StateStore): () => void {
  const unsubscribe = driver.subscribeToState(device, (deviceId, state) => stateStore.set(deviceId, state));
  driver.getState(device).then((state) => stateStore.set(device.id, state));
  return unsubscribe;
}
