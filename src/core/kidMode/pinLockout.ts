// ADR-HEARTH-176: wrong-PIN throttling. After MAX_WRONG_TRIES misses in a row the PIN is refused for
// LOCKOUT_MS; a correct entry resets the count. Pure, so the vault only persists the state.

export const MAX_WRONG_TRIES = 5;
export const LOCKOUT_MS = 30_000;

export interface LockoutState {
  /** Wrong tries in a row since the last success or lockout. */
  failures: number;
  /** Epoch ms until which every PIN is refused; 0 when not locked. */
  lockedUntil: number;
}

/** No misses, not locked. */
export function freshLockout(): LockoutState {
  return { failures: 0, lockedUntil: 0 };
}

/** Milliseconds left on a lockout, 0 when entry is allowed. */
export function lockoutRemainingMs(state: LockoutState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

/** State after one more wrong PIN; the fifth starts the lockout and restarts the count. */
export function afterWrongPin(state: LockoutState, now: number): LockoutState {
  const failures = state.failures + 1;
  return failures >= MAX_WRONG_TRIES ? { failures: 0, lockedUntil: now + LOCKOUT_MS } : { failures, lockedUntil: state.lockedUntil };
}

/** Reads a saved state back, ignoring anything malformed. */
export function normalizeLockout(raw: unknown): LockoutState {
  const stored = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const failures = typeof stored.failures === "number" && stored.failures >= 0 ? Math.floor(stored.failures) : 0;
  const lockedUntil = typeof stored.lockedUntil === "number" && stored.lockedUntil > 0 ? stored.lockedUntil : 0;
  return { failures, lockedUntil };
}
