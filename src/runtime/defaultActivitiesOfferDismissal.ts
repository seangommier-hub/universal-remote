import AsyncStorage from "@react-native-async-storage/async-storage";

// One-time dismissal of the "generate All On / All Off Activities" offer (ADR-HEARTH-200, roadmap
// item 1 from ADR-HEARTH-199). Declining it is a per-phone choice, not a recurring nag: once
// dismissed here it stays hidden on this phone even though the household still has no such
// Activity -- shouldOfferDefaultActivities's own name check is what stops the offer for good once
// either Activity actually gets created, on any phone.
const DISMISSED_KEY = "hearth.activities.defaultActivitiesOfferDismissed";

/** Whether this phone has already dismissed the default-activities offer. */
export async function isDefaultActivitiesOfferDismissed(): Promise<boolean> {
  return (await AsyncStorage.getItem(DISMISSED_KEY)) === "true";
}

/** Records the dismissal so the offer never shows again on this phone. */
export async function dismissDefaultActivitiesOffer(): Promise<void> {
  await AsyncStorage.setItem(DISMISSED_KEY, "true");
}
