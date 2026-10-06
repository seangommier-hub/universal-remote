import { useCallback, useRef, useState } from "react";
import { checkFccReachableNow } from "../discovery/familyCommandCenterHealth";

// ADR-HEARTH-213: Sean, directly -- "there needs to be a button in the hearth app on all of the
// tvs it can be called from." The offline banner (OfflineAlertBanner.tsx) already has a "Retry"
// button, but only once Hearth's OWN debounced detection has already decided there's an outage
// (getFccOutageMs's grace period, fccOutage.ts) -- today's real outages repeatedly showed that
// detection lagging or being wrong (ADR-HEARTH-210's own relay-status bug was exactly this class
// of problem). This is a manual, always-available trigger on every TV's remote screen, independent
// of whatever Hearth's own background detection currently believes.

/** How long a result ("Reached"/"Can't reach it") stays on screen before the button returns to its
 * resting state. Long enough to read at a glance, short enough not to feel stuck. */
const RESULT_DISPLAY_MS = 3000;

export type CallCommandCenterStatus = "idle" | "checking" | "reached" | "unreachable";

export interface CallCommandCenterButton {
  status: CallCommandCenterStatus;
  /** Starts a fresh check; a check already in flight is left alone rather than stacking a second one. */
  call: () => void;
}

/** Drives the "Call Command Center" utility button's own small state machine: idle -> checking ->
 * (reached | unreachable) -> back to idle after RESULT_DISPLAY_MS. The real reachability check
 * (checkFccReachableNow) is the tested unit; this hook is thin orchestration around it. */
export function useCallCommandCenterButton(): CallCommandCenterButton {
  const [status, setStatus] = useState<CallCommandCenterStatus>("idle");
  const inFlightRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const call = useCallback(() => {
    if (inFlightRef.current) return; // a check is already running -- don't stack a second one
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    inFlightRef.current = true;
    setStatus("checking");
    checkFccReachableNow()
      .then((reached) => {
        inFlightRef.current = false;
        setStatus(reached ? "reached" : "unreachable");
        resetTimerRef.current = setTimeout(() => setStatus("idle"), RESULT_DISPLAY_MS);
      })
      .catch(() => {
        // checkFccReachableNow itself never rejects, but never leave the button stuck "checking" if it somehow did
        inFlightRef.current = false;
        setStatus("unreachable");
        resetTimerRef.current = setTimeout(() => setStatus("idle"), RESULT_DISPLAY_MS);
      });
  }, []);

  return { status, call };
}
