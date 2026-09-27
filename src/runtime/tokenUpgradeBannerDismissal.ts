import AsyncStorage from "@react-native-async-storage/async-storage";

// One-time dismissal of the "a fresh pairing gets you a personal token" banner (ADR-HEARTH-181,
// phase 1). It is a single nudge, not a recurring nag: once dismissed it stays hidden even though
// the phone is still on the legacy shared token, until the person actually re-pairs (which replaces
// the saved tokenKind with "personal" and makes the banner irrelevant on its own).
const DISMISSED_KEY = "hearth.fcc.tokenUpgradeBannerDismissed";

/** Whether the person has already dismissed the token-upgrade banner once. */
export async function isTokenUpgradeBannerDismissed(): Promise<boolean> {
  return (await AsyncStorage.getItem(DISMISSED_KEY)) === "true";
}

/** Records the dismissal so the banner never shows again on this phone. */
export async function dismissTokenUpgradeBanner(): Promise<void> {
  await AsyncStorage.setItem(DISMISSED_KEY, "true");
}
