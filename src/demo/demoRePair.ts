import { Platform } from "react-native";
import { isDemoMode } from "./demoMode";

// ADR-HEARTH-223: demo-only ?repair= so the web harness can show the re-pair card through the real
// screens. The demo LG TV then behaves as if it refused Hearth's saved pairing; what happens when
// the card's "Re-pair this TV" is tapped depends on the value:
//   rejected        the TV never answers (the waiting card with its countdown stays up)
//   rejected-fails  nobody approves in time (the failed card)
//   rejected-ok     the TV is approved (Connected!, then the normal remote)

const REPAIR_QUERY_PARAM = "repair";

export type DemoRePairOutcome = "waiting" | "fails" | "succeeds";

/** How long a demo re-pair takes before it fails or succeeds, long enough to see the waiting card. */
export const DEMO_RE_PAIR_DELAY_MS = 1200;
/** How long a "never answers" demo re-pair waits (the real pairing window is far shorter than this). */
export const DEMO_RE_PAIR_NEVER_ANSWERS_MS = 120000;

const OUTCOMES: Record<string, DemoRePairOutcome> = { rejected: "waiting", "rejected-fails": "fails", "rejected-ok": "succeeds" };

/** Maps a ?repair= value to the demo outcome it asks for; null for anything else. */
export function parseDemoRePair(value: string | null): DemoRePairOutcome | null {
  return value !== null && Object.prototype.hasOwnProperty.call(OUTCOMES, value) ? OUTCOMES[value] : null;
}

/** The demo outcome requested by the current URL; null outside demo mode, off web, or when absent. */
export function demoRePairOutcome(): DemoRePairOutcome | null {
  if (!isDemoMode() || Platform.OS !== "web" || typeof window === "undefined" || !window.location) return null;
  return parseDemoRePair(new URLSearchParams(window.location.search).get(REPAIR_QUERY_PARAM));
}
