import { readFileSync } from "node:fs";
import { Device } from "../src/core/types/Device";

function isDevice(value: unknown): value is Device {
  const candidate = value as Partial<Device> | null;
  return typeof candidate?.id === "string" && typeof candidate.driverId === "string" && Array.isArray(candidate.capabilities);
}

/** Parses either a bare device array or the household sync file shape `{ devices: [...] }`; throws on anything else. */
export function parseDevices(json: string): Device[] {
  const parsed: unknown = JSON.parse(json);
  const list = Array.isArray(parsed) ? parsed : (parsed as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(list)) throw new Error("Devices file must be a JSON array or an object with a `devices` array");
  const invalid = list.findIndex((entry) => !isDevice(entry));
  if (invalid !== -1) throw new Error(`Devices file entry ${invalid} is missing id, driverId or capabilities`);
  return list as Device[];
}

/** Reads the devices file (the household sync file works as-is). */
export function loadDevicesFile(path: string): Device[] {
  return parseDevices(readFileSync(path, "utf8"));
}
