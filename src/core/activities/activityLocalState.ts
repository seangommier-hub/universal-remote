import { Activity, ActivityTrigger } from "../types/Activity";

/** This phone's copy of the household's activities plus what still has to reach the Pi (ADR-HEARTH-150). */
export interface ActivityLocalState {
  activities: Activity[];
  /** Ids edited on this phone since they were last confirmed by the Pi. */
  dirtyIds: string[];
  /** Ids deleted on this phone while the Pi was unreachable; sent on the next sync. */
  pendingDeleteIds: string[];
  triggers: ActivityTrigger[];
}

/** A state with nothing in it. */
export function emptyLocalState(): ActivityLocalState {
  return { activities: [], dirtyIds: [], pendingDeleteIds: [], triggers: [] };
}

function withoutId<T>(list: T[], id: string, idOf: (item: T) => string): T[] {
  return list.filter((item) => idOf(item) !== id);
}

/** Adds or replaces an activity as a local edit: stamps who/when, keeps its base version, and marks it for upload. */
export function saveLocalActivity(state: ActivityLocalState, activity: Activity, by: string | undefined, nowIso: string): ActivityLocalState {
  const stamped: Activity = { ...activity, updatedAt: nowIso, ...(by ? { updatedBy: by } : {}) };
  const dirtyIds = state.dirtyIds.includes(activity.id) ? state.dirtyIds : [...state.dirtyIds, activity.id];
  return {
    ...state,
    activities: [...withoutId(state.activities, activity.id, (a) => a.id), stamped],
    dirtyIds,
    pendingDeleteIds: state.pendingDeleteIds.filter((id) => id !== activity.id),
  };
}

/** Removes an activity; if the Pi has ever seen it, remembers to delete it there too. */
export function deleteLocalActivity(state: ActivityLocalState, id: string): ActivityLocalState {
  const existing = state.activities.find((a) => a.id === id);
  const needsServerDelete = existing !== undefined && existing.version > 0 && !state.pendingDeleteIds.includes(id);
  return {
    ...state,
    activities: withoutId(state.activities, id, (a) => a.id),
    dirtyIds: state.dirtyIds.filter((dirtyId) => dirtyId !== id),
    pendingDeleteIds: needsServerDelete ? [...state.pendingDeleteIds, id] : state.pendingDeleteIds,
  };
}
