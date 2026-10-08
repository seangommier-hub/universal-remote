import { Device } from "../../core/types/Device";

// ADR-HEARTH-223: the shared half of a driver's `rePair`. It takes the saved pairing credential
// out of the device's config for the length of one connect, so the driver sends a first-time
// registration (which makes the device show its own approval prompt) with exactly the same
// pairing identity as always, and puts the old credential back if that does not work out.

// The credential each device's config held before its current re-pair began. Keyed by the config
// object so two overlapping re-pairs of one device (cancel, then straight away tap again) still
// restore the true original, not the already-emptied value the second one sees.
const savedBeforeRePair = new WeakMap<object, unknown>();

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Connects `device` with its saved `credentialField` removed. On success the driver has stored the
 * newly issued credential in the config; on failure the original is restored (unless something has
 * since stored a newer one) and the error is rethrown. Never touches any other config field.
 */
export async function connectWithFreshPairing(device: Device, credentialField: string, connect: () => Promise<void>): Promise<void> {
  const config = device.config;
  if (!config) throw new Error(`Device ${device.id} has no saved connection details to re-pair`);
  if (hasValue(config[credentialField])) savedBeforeRePair.set(config, config[credentialField]);
  delete config[credentialField];
  try {
    await connect();
    savedBeforeRePair.delete(config);
  } catch (error) {
    if (!hasValue(config[credentialField]) && savedBeforeRePair.has(config)) {
      config[credentialField] = savedBeforeRePair.get(config);
    }
    savedBeforeRePair.delete(config);
    throw error;
  }
}
