/** Universal capability identifiers a device can expose. Extend this union as new device categories are implemented — do not add an id until a driver or the UI actually uses it. */
export type CapabilityId =
  | "power"
  | "powerOn"
  | "powerOff"
  | "volumeUp"
  | "volumeDown"
  | "setVolume"
  | "mute"
  | "channelUp"
  | "channelDown"
  | "setChannel"
  | "directionalNavigation"
  | "select"
  | "back"
  | "home"
  | "menu"
  | "inputSelection";

/** Directions supported by the directionalNavigation capability. */
export type NavigationDirection = "up" | "down" | "left" | "right";
