import { HaOAuthState } from "./haOAuthState";

// In-memory table of known instances' OAuth state, keyed by instance id. Persistence lives in haOAuthStateStore.ts.
const states = new Map<string, HaOAuthState>();
const listeners = new Set<(state: HaOAuthState) => void>();

/** Records (or replaces) an instance's OAuth state and notifies listeners, e.g. so UI showing a re-auth banner updates. */
export function setHaOAuthState(state: HaOAuthState): void {
  states.set(state.instanceId, state);
  listeners.forEach((listener) => listener(state));
}

/** The OAuth state for this instance, or undefined when it isn't an OAuth-signed-in instance (a plain pasted token, or unknown). */
export function getHaOAuthState(instanceId: string): HaOAuthState | undefined {
  return states.get(instanceId);
}

/** Marks an instance's OAuth session as needing a fresh sign-in (its refresh token was permanently rejected); a no-op if already marked or unknown. */
export function markHaOAuthNeedsSignIn(instanceId: string): void {
  const existing = states.get(instanceId);
  if (!existing || existing.needsSignIn) return;
  setHaOAuthState({ ...existing, needsSignIn: true });
}

/** Calls back whenever any instance's OAuth state is set or changed. */
export function onHaOAuthStateChanged(listener: (state: HaOAuthState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only: forgets every OAuth state and listener. */
export function resetHaOAuthStatesForTests(): void {
  states.clear();
  listeners.clear();
}
