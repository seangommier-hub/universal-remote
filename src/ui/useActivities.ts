import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { ActivityLocalState, deleteLocalActivity, emptyLocalState, saveLocalActivity } from "../core/activities/activityLocalState";
import { logger } from "../core/logging/logger";
import { Activity, ActivityRun, StepResult } from "../core/types/Activity";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { ActivitiesClient, familyCommandCenterActivitiesClient } from "../discovery/familyCommandCenterActivities";
import { loadActivityState, loadMemberName, saveActivityState, saveMemberName } from "../runtime/activityPersistence";
import { ActivityRunResult, mergeRetryResults, retryableIndexes, runActivity } from "../runtime/activityRunner";
import { reportRun } from "../runtime/activityRunReporter";
import { syncActivities } from "../runtime/activitySync";

const LOG_SCOPE = "useActivities";
const HISTORY_LIMIT = 10;

export interface ActivityProgress {
  activityId: string;
  index: number;
  total: number;
}

/** The most recent run: the activity that ran, its merged step results, and where to show them. */
export interface LastActivityRun {
  activity: Activity;
  result: ActivityRunResult;
  steps: StepResult[];
  surface: "modal" | "inline";
}

interface UseActivitiesDeps {
  commandEngine: CommandEngine;
  stateStore: StateStore;
  client?: ActivitiesClient;
}

function newActivityId(): string {
  return `activity-${Date.now()}`;
}

/** Owns the household's activities on this phone: local copy, background sync with the Pi, running, retrying and run history (ADR-HEARTH-150). */
export function useActivities({ commandEngine, stateStore, client = familyCommandCenterActivitiesClient }: UseActivitiesDeps) {
  const [local, setLocal] = useState<ActivityLocalState>(emptyLocalState());
  const [progress, setProgress] = useState<ActivityProgress | null>(null);
  const [lastRun, setLastRun] = useState<LastActivityRun | null>(null);
  const [history, setHistory] = useState<ActivityRun[]>([]);
  const [memberName, setMemberNameState] = useState<string | undefined>();
  const localRef = useRef(local);
  const revision = useRef(0);
  const syncing = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const commit = useCallback((next: ActivityLocalState) => {
    localRef.current = next;
    setLocal(next);
    saveActivityState(next).catch((err) => logger.warn(LOG_SCOPE, "could not save activities", { message: String(err) }));
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory((await client.fetchRuns(HISTORY_LIMIT)).slice(0, HISTORY_LIMIT));
    } catch (err) {
      logger.info(LOG_SCOPE, "run history unavailable", { message: err instanceof Error ? err.message : String(err) });
    }
  }, [client]);

  const syncNow = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    const startedRevision = revision.current;
    try {
      const report = await syncActivities(localRef.current, client, new Date().toISOString());
      if (report.reachable && report.supported && startedRevision === revision.current) commit(report.state);
      if (report.conflicts.length > 0) {
        Alert.alert("Updated from another phone", `${report.conflicts.join(", ")} was changed elsewhere first, so this phone now shows that newer version.`);
      }
      if (report.reachable && report.supported) await refreshHistory();
    } finally {
      syncing.current = false;
    }
    if (startedRevision !== revision.current) syncNow();
  }, [client, commit, refreshHistory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [state, name] = await Promise.all([loadActivityState(), loadMemberName()]);
        if (cancelled) return;
        localRef.current = state;
        setLocal(state);
        setMemberNameState(name);
      } catch (err) {
        logger.warn(LOG_SCOPE, "could not load activities; continuing with none", { message: String(err) });
      }
      if (!cancelled) syncNow();
    })();
    return () => {
      cancelled = true;
    };
  }, [syncNow]);

  const saveActivity = useCallback(
    (activity: Activity) => {
      revision.current++;
      commit(saveLocalActivity(localRef.current, activity, memberName, new Date().toISOString()));
      syncNow();
    },
    [commit, memberName, syncNow]
  );

  const removeActivity = useCallback(
    (activity: Activity) => {
      revision.current++;
      commit(deleteLocalActivity(localRef.current, activity.id));
      syncNow();
    },
    [commit, syncNow]
  );

  const finishRun = useCallback(
    async (activity: Activity, result: ActivityRunResult, steps: StepResult[], surface: LastActivityRun["surface"]) => {
      setLastRun({ activity, result, steps, surface });
      await reportRun(client, result, steps, memberName);
      refreshHistory();
    },
    [client, memberName, refreshHistory]
  );

  const run = useCallback(
    async (activity: Activity, surface: LastActivityRun["surface"] = "modal") => {
      if (controller.current) return;
      controller.current = new AbortController();
      setLastRun(null);
      const result = await runActivity(activity, { commandEngine, stateStore }, {
        signal: controller.current.signal,
        onProgress: (p) => setProgress({ activityId: activity.id, index: p.index, total: p.total }),
      });
      controller.current = null;
      setProgress(null);
      await finishRun(activity, result, result.steps, surface);
    },
    [commandEngine, stateStore, finishRun]
  );

  const retryFailed = useCallback(async () => {
    if (!lastRun || controller.current) return;
    controller.current = new AbortController();
    const retry = await runActivity(lastRun.activity, { commandEngine, stateStore }, {
      runId: lastRun.result.runId,
      onlyIndexes: retryableIndexes(lastRun.steps),
      signal: controller.current.signal,
      onProgress: (p) => setProgress({ activityId: lastRun.activity.id, index: p.index, total: p.total }),
    });
    controller.current = null;
    setProgress(null);
    const merged = mergeRetryResults(lastRun.steps, retry.steps);
    await finishRun(lastRun.activity, { ...lastRun.result, finishedAt: retry.finishedAt }, merged, lastRun.surface);
  }, [lastRun, commandEngine, stateStore, finishRun]);

  const cancelRun = useCallback(() => controller.current?.abort(), []);
  const dismissRun = useCallback(() => setLastRun(null), []);

  const updateMemberName = useCallback((name: string) => {
    setMemberNameState(name.trim() || undefined);
    saveMemberName(name).catch((err) => logger.warn(LOG_SCOPE, "could not save member name", { message: String(err) }));
  }, []);

  return {
    activities: local.activities,
    progress,
    lastRun,
    history,
    memberName,
    newActivityId,
    saveActivity,
    removeActivity,
    run,
    retryFailed,
    cancelRun,
    dismissRun,
    updateMemberName,
    syncNow,
  };
}
