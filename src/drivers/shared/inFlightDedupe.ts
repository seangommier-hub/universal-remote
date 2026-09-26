/** Runs `start` unless a call for the same key is already in flight, in which case every caller shares that one attempt; the entry clears itself when the attempt settles. */
export function dedupeInFlight<T>(inFlight: Map<string, Promise<T>>, key: string, start: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const attempt = start().finally(() => {
    if (inFlight.get(key) === attempt) inFlight.delete(key);
  });
  inFlight.set(key, attempt);
  return attempt;
}
