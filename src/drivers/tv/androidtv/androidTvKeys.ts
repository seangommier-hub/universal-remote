import { CapabilityId, NavigationDirection } from "../../../core/types/Capability";

// Key names the Pi's Android TV bridge accepts (Pi adr/0197). "CENTER" is the D-pad centre press
// and "MUTE" is speaker mute (the bridge maps it to VOLUME_MUTE, not the microphone key).
export const DIRECTION_KEYS: Record<NavigationDirection, string> = {
  up: "DPAD_UP",
  down: "DPAD_DOWN",
  left: "DPAD_LEFT",
  right: "DPAD_RIGHT",
};

export const SIMPLE_CAPABILITY_KEYS: Partial<Record<CapabilityId, string>> = {
  volumeUp: "VOLUME_UP",
  volumeDown: "VOLUME_DOWN",
  mute: "MUTE",
  select: "CENTER",
  home: "HOME",
  back: "BACK",
  playPause: "MEDIA_PLAY_PAUSE",
  // ADR-HEARTH-234: already on the Pi bridge's key allowlist (FCC androidtv-command-policy.ts /
  // androidtv_bridge.py ALLOWED_KEYS), so these need no Pi change.
  menu: "MENU",
  channelUp: "CHANNEL_UP",
  channelDown: "CHANNEL_DOWN",
};

export const POWER_KEY = "POWER";

// Verified against androidtvremote2's own key list: it has volume up/down/mute keys and no absolute
// volume, no channel-number entry on this bridge and no input switch that works on a streamer, so
// setVolume, setChannel and inputSelection are deliberately NOT declared. Text entry relies on the TV's own
// on-screen keyboard being focused (the library warns it may not work while a virtual keyboard shows).
export const ANDROID_TV_CAPABILITIES: CapabilityId[] = [
  "power",
  "volumeUp",
  "volumeDown",
  "mute",
  "directionalNavigation",
  "select",
  "home",
  "back",
  "playPause",
  "launchApp",
  "textEntry",
  // ADR-HEARTH-234 (Sean, 2026-10-26: "just add as many as possible per remote"). Channel keys act
  // on the TV's tuner/live-TV app; on a streamer with no tuner the press is ignored by the device.
  "menu",
  "channelUp",
  "channelDown",
];
