/** Maps a Hearth command to the Sony BRAVIA REST/IRCC-IP call that performs it, reporting what the driver already knows about the resulting state. */

import { NavigationDirection } from "../../../core/types/Capability";
import { Command } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { SonyBraviaClient, SonyBraviaConfig } from "./SonyBraviaClient";
import { SonyIrccClient, SONY_IRCC_CODES } from "./SonyIrccClient";
import { CommandValidationError } from "../../shared/commandFailure";

const VOLUME_STEP = 2;

/** What applyCommand learned about the resulting state (ADR-HEARTH-179): `patch` for a command
 * whose new value is already known (an exact set, or nothing state-relevant changed at all — an
 * empty patch), or `needsVolumeRefresh` for the one case (a relative volume step) where the only
 * honest answer requires an actual read-back. */
export interface CommandOutcome {
  patch?: DeviceState["values"];
  needsVolumeRefresh?: boolean;
}

export interface PowerStatus {
  status: "active" | "standby";
}

export interface VolumeInfo {
  target: string;
  volume: number;
  mute: boolean;
  maxVolume: number;
  minVolume: number;
}

const DIRECTION_TO_IRCC_CODE: Record<NavigationDirection, string> = {
  up: SONY_IRCC_CODES.up,
  down: SONY_IRCC_CODES.down,
  left: SONY_IRCC_CODES.left,
  right: SONY_IRCC_CODES.right,
};

/** Reads and validates the `{ipAddress, psk}` config every Sony REST/IRCC-IP call needs. */
export function requireConfig(device: Device): SonyBraviaConfig {
  const ipAddress = device.config?.ipAddress;
  const psk = device.config?.psk;
  if (typeof ipAddress !== "string" || typeof psk !== "string") {
    throw new Error(`Device ${device.id} is missing Sony BRAVIA config (config.ipAddress and config.psk) — pair it first`);
  }
  return { ipAddress, psk };
}

function parseHdmiInput(input: string): string {
  const match = /^hdmi(\d+)$/i.exec(input);
  if (!match) {
    throw new CommandValidationError(`Unrecognized Sony input '${input}' — expected a value like 'hdmi1'`);
  }
  return `extInput:hdmi?port=${match[1]}`;
}

/** A legacy "hdmi1"-style shorthand (the static UI fallback list) still needs translating to a real uri; a value already read off the TV via getCurrentExternalInputsStatus (real-hardware research, 2026-09-10) is already a real uri and is sent through as-is. */
function resolveInputUri(input: string): string {
  return /^hdmi\d+$/i.test(input) ? parseHdmiInput(input) : input;
}

/**
 * Executes one command's Sony REST/IRCC-IP call and reports what the driver already knows about
 * the resulting state (ADR-HEARTH-071 for the IRCC-IP capabilities, ADR-HEARTH-179 for which
 * commands can skip a read-back).
 */
export async function applyCommand(client: SonyBraviaClient, device: Device, command: Command): Promise<CommandOutcome> {
  switch (command.capability) {
    case "power": {
      const [power] = await client.call<PowerStatus[]>("system", "getPowerStatus");
      const nextIsActive = power.status !== "active";
      await client.call("system", "setPowerStatus", [{ status: nextIsActive }]);
      // The read above already had to happen to decide which way to toggle — its result plus the
      // exact value we just sent tells us the new state outright (ADR-HEARTH-179).
      return { patch: { power: nextIsActive ? "on" : "off" } };
    }
    case "volumeUp":
      await client.call("audio", "setAudioVolume", [{ target: "speaker", volume: `+${VOLUME_STEP}` }]);
      // A relative adjustment — Sony's setAudioVolume response doesn't carry the resulting level,
      // so the actual new volume can only be read back (kept exactly as before, ADR-HEARTH-179).
      return { needsVolumeRefresh: true };
    case "volumeDown":
      await client.call("audio", "setAudioVolume", [{ target: "speaker", volume: `-${VOLUME_STEP}` }]);
      return { needsVolumeRefresh: true };
    case "setVolume": {
      const target = command.args?.volume;
      if (typeof target !== "number") throw new CommandValidationError("setVolume requires a numeric 'volume' arg");
      await client.call("audio", "setAudioVolume", [{ target: "speaker", volume: String(target) }]);
      // Exact value we just set, unlike volumeUp/volumeDown's relative step — trust it rather
      // than paying a read-back to confirm what we already know (ADR-HEARTH-179).
      return { patch: { volume: target } };
    }
    case "mute": {
      const [info] = await client.call<VolumeInfo[]>("audio", "getVolumeInformation");
      const nextMuted = !info.mute;
      await client.call("audio", "setAudioMute", [{ status: nextMuted }]);
      // This read is load-bearing (setAudioMute takes an explicit boolean, so the current value
      // has to be known before it can be flipped), not a verification read-back — it already
      // gave us the current volume too, and muting doesn't change it, so no second read is needed
      // (ADR-HEARTH-179).
      return { patch: { volume: info.volume, muted: nextMuted } };
    }
    case "inputSelection": {
      const input = command.args?.input;
      if (typeof input !== "string") throw new CommandValidationError("inputSelection requires a string 'input' arg");
      await client.call("avContent", "setPlayContent", [{ uri: resolveInputUri(input) }]);
      return {};
    }
    case "directionalNavigation": {
      const direction = command.args?.direction as NavigationDirection | undefined;
      if (!direction || !(direction in DIRECTION_TO_IRCC_CODE)) {
        throw new CommandValidationError("directionalNavigation requires a valid 'direction' arg");
      }
      await new SonyIrccClient(requireConfig(device)).sendCode(DIRECTION_TO_IRCC_CODE[direction]);
      return {};
    }
    case "select":
      await new SonyIrccClient(requireConfig(device)).sendCode(SONY_IRCC_CODES.confirm);
      return {};
    case "back":
      await new SonyIrccClient(requireConfig(device)).sendCode(SONY_IRCC_CODES.return);
      return {};
    case "home":
      await new SonyIrccClient(requireConfig(device)).sendCode(SONY_IRCC_CODES.home);
      return {};
    default:
      throw new CommandValidationError(`SonyBraviaDriver does not implement capability: ${command.capability}`);
  }
}
