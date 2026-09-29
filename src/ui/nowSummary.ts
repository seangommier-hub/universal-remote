import { CapabilityId } from "../core/types/Capability";
import { DeviceListModel } from "../core/layout/deviceGrouping";
import { ConnectionState } from "../core/types/DeviceState";
import { Device, DeviceCategory } from "../core/types/Device";
import { resolveTitle } from "./useNowPlaying";

// ADR-HEARTH-194: the "Now" summary view (ADR-HEARTH-162 item 1's auto-generated home screen) --
// a filtered, re-sorted read of the same live StateStore data the grouped Devices list already
// renders, never a second source of truth and never its own poll.

/** Categories the Now view never shows, even if a future driver somehow reports one "on" -- there
 * is nothing here for a one-tap Off button to do (a camera or sensor has no power state to flip;
 * an action/scene has no "off"). */
const NOW_EXCLUDED_CATEGORIES: ReadonlySet<DeviceCategory> = new Set<DeviceCategory>(["camera", "sensor", "action"]);

/** The generic fallback resolveTitle returns when no real app name is known -- used here to tell
 * "genuinely named" apart from "just playing something unnamed" (see describeNowStatus). */
const GENERIC_PLAYBACK_TITLE = "Now Playing";

export interface NowStateLike {
  connection: ConnectionState;
  values: Record<string, unknown>;
}

export interface NowDeviceRow {
  device: Device;
  /** One-line status, e.g. "Netflix", "Netflix (paused)", or the plain "On". */
  status: string;
  /** The capability the row's Off button sends. */
  offCapability: CapabilityId;
}

/**
 * The capability a device's Off button should send, or null when it has neither -- the same
 * powerOff-first precedence UniversalTvRemote.tsx's own power button already uses (ADR-HEARTH-133),
 * kept as its own pure function here since the Now view needs it before a device is ever opened.
 */
export function offCapabilityFor(device: Pick<Device, "capabilities">): CapabilityId | null {
  if (device.capabilities.includes("powerOff")) return "powerOff";
  return device.capabilities.includes("power") ? "power" : null;
}

/**
 * True when a device counts as "on" for the Now view: not an excluded category, has a real Off
 * action to offer, is actually connected right now (a disconnected device's last-known values are
 * never trusted here), and either its power value or its live playback state says something is
 * genuinely happening.
 */
export function isDeviceOn(device: Pick<Device, "category" | "capabilities">, state: NowStateLike): boolean {
  if (NOW_EXCLUDED_CATEGORIES.has(device.category)) return false;
  if (!offCapabilityFor(device)) return false;
  if (state.connection !== "connected") return false;
  if (state.values.power === "on") return true;
  const playback = state.values.playbackState;
  return playback === "playing" || playback === "paused";
}

/** The row's one-line status: the live app name while playing/paused (ADR-HEARTH-093's own
 * resolveTitle), else the plain "On". */
export function describeNowStatus(values: Record<string, unknown>): string {
  const playback = values.playbackState;
  if (playback !== "playing" && playback !== "paused") return "On";
  const title = resolveTitle(values);
  const named = title !== GENERIC_PLAYBACK_TITLE;
  if (playback === "paused") return named ? `${title} (paused)` : "Paused";
  return named ? title : "Playing";
}

/**
 * Every currently-on, controllable device in the grouped list's own section order (so Now reads
 * as a subset of the familiar list, not a re-shuffled one), each with its status line and Off
 * capability. Works the same in Type or Room mode -- either way `model.sections` covers every
 * visible device exactly once.
 */
export function buildNowRows(model: DeviceListModel, getState: (deviceId: string) => NowStateLike): NowDeviceRow[] {
  const rows: NowDeviceRow[] = [];
  for (const section of model.sections) {
    for (const device of section.devices) {
      const state = getState(device.id);
      if (!isDeviceOn(device, state)) continue;
      const offCapability = offCapabilityFor(device);
      if (!offCapability) continue;
      rows.push({ device, status: describeNowStatus(state.values), offCapability });
    }
  }
  return rows;
}
