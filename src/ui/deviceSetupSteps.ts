/**
 * Step-by-step setup instructions for the brands whose Add flow needs real, required action on
 * the device itself before (or during) pairing — not just informational copy. Sean, directly
 * (2026-09-13): "any device add that requires additional steps should have 'Setup This Device'...
 * all associated operations that must happen be it user required or otherwise needs to be
 * included." Kept as data, separate from DeviceSetupGuideScreen.tsx's rendering, so each
 * Add*DeviceScreen just supplies its own list rather than duplicating the guide UI.
 *
 * Roku and Yamaha deliberately have no entry here — both drivers' own docstrings already state
 * there's no pairing prompt and no PSK/password (ADR-HEARTH-007/054), so there is no real "extra
 * step" to guide anyone through; a "Setup This Device" link with nothing genuine behind it would
 * be worse than no link at all.
 */
export interface DeviceSetupGuide {
  title: string;
  steps: string[];
}

export const SONY_SETUP_GUIDE: DeviceSetupGuide = {
  title: "Set up your Sony TV",
  steps: [
    "On the TV, open Settings.",
    "Go to Network & Internet → Home Network.",
    "Turn on IP Control.",
    "Tap Authentication and set it to \"Pre-Shared Key\".",
    "Enter a key you'll remember (letters/numbers, e.g. 0000) and save it.",
    "Come back here and enter the TV's IP address and that same key below.",
  ],
};

export const SAMSUNG_SETUP_GUIDE: DeviceSetupGuide = {
  title: "Set up your Samsung TV",
  steps: [
    "Make sure the TV is turned on and connected to the same Wi-Fi network as your phone.",
    "Enter the TV's IP address below and tap Connect.",
    "Watch the TV screen — within 20 seconds it will show an Allow/Deny prompt.",
    "Using the TV's own remote, select Allow.",
  ],
};

export const LG_SETUP_GUIDE: DeviceSetupGuide = {
  title: "Set up your LG TV",
  steps: [
    "Make sure the TV is turned on and connected to the same Wi-Fi network as your phone.",
    "Make sure Family Command Center is already paired (Settings → the link icon on the home screen).",
    "Enter the TV's IP address below and tap Connect.",
    "Watch the TV screen — within 30 seconds it will show an Allow/Deny prompt.",
    "Using the TV's own remote, select Allow.",
  ],
};

// Real-hardware research (2026-09-13): Xbox's power-on protocol has no pairing step at all — it's
// a one-way, unauthenticated broadcast (see XboxDriver.ts) — so the only real "setup" is finding
// the console's own Live ID, which isn't visible anywhere except the console's own settings menu.
export const XBOX_SETUP_GUIDE: DeviceSetupGuide = {
  title: "Set up your Xbox",
  steps: [
    "On the Xbox, open Settings (press the Xbox button, then go to Profile & system → Settings).",
    "Go to System → Console info.",
    "Find \"Xbox Live device ID\" — a long string of numbers and letters.",
    "Come back here and enter that ID, plus the console's IP address, below.",
    "Make sure the Xbox is fully plugged into power — power-on only works from standby, not a fully unplugged console.",
  ],
};
