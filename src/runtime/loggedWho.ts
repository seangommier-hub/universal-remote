import { whoForCause } from "../core/activityLog/activityCause";
import { isKidModeActive } from "./kidModeState";
import { getPhoneName, getSavedPhoneName } from "./phoneName";

// ADR-HEARTH-176: who the household log names for a command the phone's holder pressed by hand.
// In kid mode that is "Kid mode" (or "<phone name> (kid mode)" when the phone has a name), never the adult's name.

/** The `who` for a plain button press on this phone right now. */
export function getLoggedWho(): string {
  return isKidModeActive() ? whoForCause({ kind: "kid-mode", phoneName: getSavedPhoneName() }) : getPhoneName();
}
