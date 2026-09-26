/** Limits of the Family Command Center activity contract (ADR-HEARTH-150); the editor enforces them so the Pi never rejects a save. */
export const ACTIVITY_NAME_MIN = 1;
export const ACTIVITY_NAME_MAX = 80;
export const ACTIVITY_MAX_STEPS = 50;
export const DELAY_MIN_MS = 0;
export const DELAY_MAX_MS = 600_000;
export const WAIT_TIMEOUT_MIN_MS = 1_000;
export const WAIT_TIMEOUT_MAX_MS = 120_000;
export const DEFAULT_DELAY_MS = 3_000;
export const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 3;
