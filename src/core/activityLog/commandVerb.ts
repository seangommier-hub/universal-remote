import { CapabilityId, StreamingService } from "../types/Capability";
import { Command } from "../types/Command";

// ADR-HEARTH-170: plain-language wording for the household activity log. Every phrase completes
// "<who> <verb> <device>", so it ends with a preposition where one is needed ("turned the volume up on").
// Only fixed words and a service name are ever produced: never typed text, PINs, addresses or tokens.

const SERVICE_NAMES: Record<StreamingService, string> = {
  netflix: "Netflix",
  hulu: "Hulu",
  primeVideo: "Prime Video",
  youtube: "YouTube",
};

const VERBS: Record<CapabilityId, string> = {
  power: "used the power button on",
  powerOn: "turned on",
  powerOff: "turned off",
  volumeUp: "turned the volume up on",
  volumeDown: "turned the volume down on",
  setVolume: "set the volume on",
  mute: "toggled mute on",
  channelUp: "went up a channel on",
  channelDown: "went down a channel on",
  setChannel: "changed the channel on",
  directionalNavigation: "moved around the menu on",
  select: "pressed OK on",
  back: "pressed Back on",
  home: "pressed Home on",
  menu: "opened the menu on",
  inputSelection: "switched the input on",
  sleepTimer: "set the sleep timer on",
  settings: "opened settings on",
  launchApp: "launched an app on",
  openSourceList: "opened the input list on",
  setBrightness: "changed the brightness of",
  setColor: "changed the color of",
  playPause: "pressed play/pause on",
  play: "pressed play on",
  pause: "pressed pause on",
  rewind: "pressed rewind on",
  fastForward: "pressed fast-forward on",
  selectPlayPause: "pressed OK on",
  textEntry: "typed text on",
  dispense: "dispensed a treat from",
  vacuumStart: "started",
  vacuumStop: "stopped",
  vacuumDock: "docked",
  setSuctionPower: "changed the suction of",
  open: "opened",
  close: "closed",
  stop: "stopped",
  setPosition: "moved",
  lock: "locked",
  unlock: "unlocked",
  trigger: "ran",
  setTemperature: "changed the temperature on",
  setHvacMode: "changed the mode on",
  setFanSpeed: "changed the fan speed on",
  setFanPreset: "changed the fan mode on",
};

/** Buttons pressed dozens of times while navigating; a successful press is not worth a line (failures still are). */
const NAVIGATION_NOISE: ReadonlySet<CapabilityId> = new Set<CapabilityId>([
  "directionalNavigation",
  "select",
  "back",
  "home",
  "menu",
  "settings",
  "selectPlayPause",
]);

const FALLBACK_VERB = "sent a command to";

function serviceVerb(args: Command["args"]): string {
  const service = args?.service;
  const name = typeof service === "string" ? SERVICE_NAMES[service as StreamingService] : undefined;
  return name ? `launched ${name} on` : VERBS.launchApp;
}

/** The plain-language phrase for a command, safe to store and show to the whole household. */
export function describeCommandVerb(command: Command): string {
  if (command.capability === "launchApp") return serviceVerb(command.args);
  return VERBS[command.capability] ?? FALLBACK_VERB;
}

/** True when a command belongs in the household log; navigation-style presses only count when they fail. */
export function isWorthLogging(capability: CapabilityId, succeeded: boolean): boolean {
  return !succeeded || !NAVIGATION_NOISE.has(capability);
}
