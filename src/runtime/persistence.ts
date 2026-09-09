import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Device } from "../core/types/Device";

const DEVICES_STORAGE_KEY = "hearth.devices";
// Config fields whose values are credentials, not just connection metadata — kept out of
// AsyncStorage (plaintext) and stored per-device in SecureStore instead.
const SENSITIVE_CONFIG_KEYS = ["psk"];

function secureStoreKey(deviceId: string, field: string): string {
  return `hearth.device.${deviceId}.${field}`;
}

/** Splits a device's config into non-sensitive (stored inline) and sensitive (stored separately) fields, then persists both. */
export async function saveDevice(device: Device): Promise<void> {
  const { safeConfig, sensitiveEntries } = splitConfig(device.config);
  const deviceToStore: Device = { ...device, config: safeConfig };

  await Promise.all(sensitiveEntries.map(([field, value]) => SecureStore.setItemAsync(secureStoreKey(device.id, field), String(value))));

  const existing = await loadStoredDeviceList();
  const next = [...existing.filter((d) => d.id !== device.id), deviceToStore];
  await AsyncStorage.setItem(DEVICES_STORAGE_KEY, JSON.stringify(next));
}

/** Loads every persisted device with its sensitive config fields rehydrated from SecureStore. */
export async function loadDevices(): Promise<Device[]> {
  const stored = await loadStoredDeviceList();
  return Promise.all(
    stored.map(async (device) => {
      const rehydrated = { ...(device.config ?? {}) };
      for (const field of SENSITIVE_CONFIG_KEYS) {
        const value = await SecureStore.getItemAsync(secureStoreKey(device.id, field));
        if (value !== null) rehydrated[field] = value;
      }
      return { ...device, config: rehydrated };
    })
  );
}

export async function removeDevice(deviceId: string): Promise<void> {
  const existing = await loadStoredDeviceList();
  await AsyncStorage.setItem(DEVICES_STORAGE_KEY, JSON.stringify(existing.filter((d) => d.id !== deviceId)));
  await Promise.all(SENSITIVE_CONFIG_KEYS.map((field) => SecureStore.deleteItemAsync(secureStoreKey(deviceId, field))));
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
