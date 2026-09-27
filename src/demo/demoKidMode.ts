import { Platform } from "react-native";
import { KidModeSettings } from "../core/kidMode/kidModeSettings";
import { isDemoMode } from "./demoMode";

// ADR-HEARTH-176: demo-only ?kid=on | bedtime so the web harness can show kid mode and the Bedtime screen.

const KID_QUERY_PARAM = "kid";
const LAST_MINUTE_OF_DAY = 24 * 60 - 1;

/** Fixed kid-mode settings when the demo URL asks for them; null means use the phone's real saved settings. */
export function demoKidModeSettings(): KidModeSettings | null {
  if (!isDemoMode() || Platform.OS !== "web" || typeof window === "undefined") return null;
  const kind = new URLSearchParams(window.location.search).get(KID_QUERY_PARAM);
  if (kind === "on") return { enabled: true };
  if (kind === "bedtime") return { enabled: true, bedtime: { startMinutes: 0, endMinutes: LAST_MINUTE_OF_DAY } };
  return null;
}
