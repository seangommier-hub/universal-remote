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
};

export const POWER_KEY = "POWER";

// Verified against androidtvremote2's own key list: it has volume up/down/mute keys and no absolute
// volume, no channel-number entry and no input switch that works on a streamer, so setVolume,
// setChannel and inputSelection are deliberately NOT declared. Text entry relies on the TV's own
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
];
