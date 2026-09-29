import { useCallback, useEffect, useState } from "react";
import { buildAllOffActivity, buildAllOnActivity, shouldOfferDefaultActivities } from "../core/activities/defaultActivities";
import { Activity } from "../core/types/Activity";
import { Device } from "../core/types/Device";
import { logger } from "../core/logging/logger";
import { dismissDefaultActivitiesOffer, isDefaultActivitiesOfferDismissed } from "../runtime/defaultActivitiesOfferDismissal";

const LOG_SCOPE = "useDefaultActivitiesOffer";

export interface DefaultActivitiesOfferControls {
  visible: boolean;
  /** Builds the two draft Activities; the caller still has to save them (e.g. via useActivities.saveActivity). */
  generate: () => { allOn: Activity; allOff: Activity };
  /** Hides the offer on this phone for good, without generating anything. */
  dismiss: () => void;
}

/** Drives the one-time "generate All On / All Off" offer (ADR-HEARTH-200). Purely a nudge -- never generates anything on its own, only offers to. */
export function useDefaultActivitiesOffer(devices: Device[], activities: Activity[], newActivityId: () => string): DefaultActivitiesOfferControls {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    isDefaultActivitiesOfferDismissed()
      .then((value) => {
        if (!cancelled) setDismissed(value);
      })
      .catch((error) => {
        // Purely informational, so a read failure just means the offer stays hidden rather than
        // risking it re-showing every launch (same "fail closed" choice as useTokenUpgradeBanner).
        if (!cancelled) logger.warn(LOG_SCOPE, "could not check whether the offer was dismissed", { error: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(() => {
    const nowIso = new Date().toISOString();
    const base = newActivityId();
    const allOn = buildAllOnActivity(devices, `${base}-on`, nowIso);
    const allOff = buildAllOffActivity(devices, `${base}-off`, nowIso);
    setDismissed(true);
    void dismissDefaultActivitiesOffer();
    return { allOn, allOff };
  }, [devices, newActivityId]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    void dismissDefaultActivitiesOffer();
  }, []);

  return { visible: !dismissed && shouldOfferDefaultActivities(devices, activities), generate, dismiss };
}
