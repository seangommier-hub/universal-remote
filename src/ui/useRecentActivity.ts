import { useCallback, useEffect, useState } from "react";
import { ActivityLogEntry } from "../core/activityLog/activityLogEntry";
import { fetchRecentActivity } from "../discovery/familyCommandCenterActivityLog";

export type RecentActivityState =
  | { status: "loading" }
  | { status: "ready"; entries: ActivityLogEntry[] }
  | { status: "unavailable" };

/** Loads the household's recent activity once and on demand; a failure becomes "unavailable" rather than an error the person must act on. */
export function useRecentActivity(): { state: RecentActivityState; refresh: () => void } {
  const [state, setState] = useState<RecentActivityState>({ status: "loading" });

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    fetchRecentActivity()
      .then((entries) => setState({ status: "ready", entries }))
      .catch(() => setState({ status: "unavailable" }));
  }, []);

  useEffect(refresh, [refresh]);
  return { state, refresh };
}
