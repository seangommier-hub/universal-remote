/** Where to load a device's current snapshot image from (ADR-HEARTH-182): a plain URI, or one that needs an auth header the caller's Image component must attach.
 * `placeholder` (ADR-HEARTH-191): true when there is no real image yet (a Ring camera that hasn't
 * captured a snapshot, or whose per-camera fetch 404'd for that same reason) — the fetch itself
 * succeeded in determining "nothing to show", so this is not an error. `uri` is then a local
 * placeholder asset, never a network request. */
export interface SnapshotImage {
  uri: string;
  headers?: Record<string, string>;
  placeholder?: boolean;
}

/** The outcome of fetching a device's snapshot through CommandEngine.fetchSnapshot. Never throws — callers check `success`. */
export interface SnapshotResult {
  success: boolean;
  image?: SnapshotImage;
  error?: string;
}
