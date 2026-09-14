/**
 * Step-by-step setup instructions for the brands whose Add flow needs real, required action on
 * the device itself before (or during) pairing — not just informational copy. Sean, directly
 * (2026-09-13): "any device add that requires additional steps should have 'Setup This Device'...
 * all associated operations that must happen be it user required or otherwise needs to be
 * included." Kept as data, separate from DeviceSetupGuideScreen.tsx's rendering, so each
 * Add*DeviceScreen just supplies its own list rather than duplicating the guide UI.
 *
 * Yamaha deliberately has no entry here — its driver's own docstring states there's no pairing
 * prompt and no PSK/password at all (ADR-HEARTH-054), so there is no real "extra step" to guide
 * anyone through; a "Setup This Device" link with nothing genuine behind it would be worse than no
 * link at all. Roku DOES get one (2026-09-14 correction) — see ROKU_SETUP_GUIDE below.
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
// Real-hardware correction (2026-09-14): ADR-HEARTH-063 originally excluded Roku from this
// pattern, reasoning it has "no real extra step" — but AddRokuDeviceScreen.tsx's own existing hint
// text already contradicted that: "Control by mobile apps" is a real toggle (Settings → System →
// Advanced system settings) that must be on for ECP to work at all, usually on by default but not
// guaranteed. Real prerequisite, just a less commonly-tripped one than Sony's PSK — still deserves
// the same guided treatment for consistency.
export const ROKU_SETUP_GUIDE: DeviceSetupGuide = {
  title: "Set up your Roku",
  steps: [
    "On the Roku, press Home, then go to Settings.",
    "Go to System → Advanced system settings.",
    "Open Control by mobile apps.",
    "Make sure Network access is set to \"Default\" or \"Permissive\" (not \"Blocked\").",
    "Enter the Roku's IP address below — no password needed.",
  ],
};

// Real-hardware correction (2026-09-14), same audit that added ROKU_SETUP_GUIDE: SmartThings'
// real prerequisite (ADR-HEARTH-042's own confirmed, live-verified facts — "Hearth" is an
// unpublished WEBHOOK_SMART_APP with no in-app OAuth screen, installed entirely through the
// SmartThings mobile app itself) was even harder to find than Roku's — it only ever appeared as a
// one-line empty-state message AFTER the outlet list came back empty, not before. Steps below are
// kept to what ADR-HEARTH-042 actually confirmed live; deliberately not inventing an exact
// Developer-Mode tap path within the SmartThings app that hasn't been verified against its real
// UI, unlike every other guide here.
export const SMARTTHINGS_SETUP_GUIDE: DeviceSetupGuide = {
  title: "Set up SmartThings outlets",
  steps: [
    "Open the SmartThings app and sign in with your Samsung account.",
    "Turn on Developer Mode in the app (search \"SmartThings Developer Mode\" if you don't see the option — this unlocks installing apps that aren't in the public marketplace).",
    "Search for and install \"Hearth\" from Developer Mode.",
    "On its setup page inside SmartThings, select which outlets to share.",
    "Come back here and tap \"Sync from SmartThings\" — your outlets will appear below.",
  ],
};

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
