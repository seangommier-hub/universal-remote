/** Where to load a device's current snapshot image from (ADR-HEARTH-182): a plain URI, or one that needs an auth header the caller's Image component must attach. */
export interface SnapshotImage {
  uri: string;
  headers?: Record<string, string>;
}

/** The outcome of fetching a device's snapshot through CommandEngine.fetchSnapshot. Never throws — callers check `success`. */
export interface SnapshotResult {
  success: boolean;
  image?: SnapshotImage;
  error?: string;
}
