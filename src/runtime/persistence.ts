import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Device } from "../core/types/Device";
import { isKeychainUnavailable } from "../core/network/isKeychainUnavailable";
import { logger } from "../core/logging/logger";

const LOG_SCOPE = "persistence";
const DEVICES_STORAGE_KEY = "hearth.devices";
let saveQueue: Promise<void> = Promise.resolve();
// Config fields whose values are credentials, not just connection metadata — kept out of
// AsyncStorage (plaintext) and stored per-device in SecureStore instead. Real gap found in a
// security audit (2026-09-19, ADR-HEARTH-091): this list was never updated when LG's `clientKey`
// (LgWebOsDriver.ts) and Samsung's `token` (SamsungTizenDriver.ts) were added, even though
// ADR-HEARTH-008 already documented the standing rule that a new driver's real credential field
// must be added here. Both are real pairing secrets, the same class as Sony's `psk` already
// covered — landed in plain AsyncStorage until now.
// `secret` added 2026-09-21 (ADR-HEARTH-118) for SwitchBotVacuumDriver's HMAC signing key —
// applying that same standing rule proactively this time, not after a fresh audit finds it missing.
const SENSITIVE_CONFIG_KEYS = ["psk", "clientKey", "token", "secret"];

// Real-hardware finding (2026-09-09): SecureStore keys may only contain alphanumerics, ".",
// "-", and "_" -- a device id built from a MAC address (FamilyCommandCenterDiscoveryProvider's
// `fcc-${hwaddr}`, e.g. "fcc-aa:bb:cc:dd:ee:ff") contains colons and fails that check. This threw
// on every SecureStore call, including the read in loadDevices() at app startup -- unhandled,
// it kept setReady(true) from ever running, hanging the whole app on its loading spinner
// indefinitely. Sanitizing here, at the actual boundary that imposes the constraint, protects
// against this for any future id format too, not just today's MAC-address case.
function secureStoreKey(deviceId: string, field: string): string {
  const safeId = deviceId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `hearth.device.${safeId}.${field}`;
}

/** Splits a device's config into non-sensitive (stored inline) and sensitive (stored separately) fields, then persists both. */
export function saveDevice(device: Device): Promise<void> {
  // Serialized: the list is read, changed and written back whole, so overlapping saves (a bulk import adds dozens at once) would drop each other's devices.
  const run = saveQueue.then(() => writeDevice(device));
  saveQueue = run.catch(() => undefined);
  return run;
}

async function writeDevice(device: Device): Promise<void> {
  const { safeConfig, sensitiveEntries } = splitConfig(device.config);
  const deviceToStore: Device = { ...device, config: safeConfig };

  await Promise.all(sensitiveEntries.map(([field, value]) => SecureStore.setItemAsync(secureStoreKey(device.id, field), String(value))));

  const existing = await loadStoredDeviceList();
  const next = [...existing.filter((d) => d.id !== device.id), deviceToStore];
  await AsyncStorage.setItem(DEVICES_STORAGE_KEY, JSON.stringify(next));
}

/** Loads every persisted device with its sensitive config fields rehydrated from SecureStore.
 * ADR-HEARTH-203: a SecureStore read can throw (a Keychain-locked phone, ADR-HEARTH-196) for one
 * field of one device. That used to reject the whole `Promise.all`, and App.tsx's own startup
 * catch (see its comment there) then silently started the session with an EMPTY device list —
 * every saved device, not just the one whose field failed. Each field is now read independently:
 * a failure leaves just that field un-rehydrated (the device — and every other device — still
 * comes back) rather than losing the whole list to one bad read. */
export async function loadDevices(): Promise<Device[]> {
  const stored = await loadStoredDeviceList();
  return Promise.all(stored.map((device) => rehydrateDevice(device)));
}

async function rehydrateDevice(device: Device): Promise<Device> {
  const rehydrated = { ...(device.config ?? {}) };
  for (const field of SENSITIVE_CONFIG_KEYS) {
    try {
      const value = await SecureStore.getItemAsync(secureStoreKey(device.id, field));
      if (value !== null) rehydrated[field] = value;
    } catch (error) {
      logSecureStoreFailure(`could not read ${field} for ${device.id}`, error);
    }
  }
  return { ...device, config: rehydrated };
}

export async function removeDevice(deviceId: string): Promise<void> {
  const existing = await loadStoredDeviceList();
  await AsyncStorage.setItem(DEVICES_STORAGE_KEY, JSON.stringify(existing.filter((d) => d.id !== deviceId)));
  // ADR-HEARTH-203: each field's delete is independent and never throws — a Keychain failure on
  // one field (or one field never having been set) must not stop the others from being cleaned up,
  // nor reject a call whose list removal (the part the user actually asked for and already sees
  // reflected in the UI) already succeeded.
  await Promise.all(
    SENSITIVE_CONFIG_KEYS.map(async (field) => {
      try {
        await SecureStore.deleteItemAsync(secureStoreKey(deviceId, field));
      } catch (error) {
        logSecureStoreFailure(`could not delete ${field} for ${deviceId}`, error);
      }
    })
  );
}

function logSecureStoreFailure(action: string, error: unknown): void {
  if (isKeychainUnavailable(error)) {
    logger.debug(LOG_SCOPE, `${action} — Keychain unavailable right now (phone locked or app backgrounded)`);
  } else {
    logger.warn(LOG_SCOPE, action, { error: String(error) });
  }
}

/** Deletes one secret field of one device from secure storage (used when a credential moves to a shared store). */
export async function deleteDeviceSecret(deviceId: string, field: string): Promise<void> {
  await SecureStore.deleteItemAsync(secureStoreKey(deviceId, field));
}

async function loadStoredDeviceList(): Promise<Device[]> {
  const raw = await AsyncStorage.getItem(DEVICES_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Device[];
  } catch {
    return [];
  }
}

function splitConfig(config: Device["config"]): { safeConfig: Record<string, unknown>; sensitiveEntries: [string, unknown][] } {
  const safeConfig: Record<string, unknown> = {};
  const sensitiveEntries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(config ?? {})) {
    if (SENSITIVE_CONFIG_KEYS.includes(key)) {
      sensitiveEntries.push([key, value]);
    } else {
      safeConfig[key] = value;
    }
  }
  return { safeConfig, sensitiveEntries };
}
