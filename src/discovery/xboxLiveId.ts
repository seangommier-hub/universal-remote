// ADR-HEARTH-155: there is no safe way to check an Xbox at add time (its power-on protocol is a
// one-way broadcast, and probing would wake the console), so the one thing checkable immediately
// is whether the typed Live ID looks like one: 16 hexadecimal characters, e.g. FD00112233445566.

const LIVE_ID_PATTERN = /^[0-9A-F]{16}$/;

export const XBOX_LIVE_ID_PATH = "On the Xbox: Settings > System > Console info > Xbox Live device ID";

/** Uppercases a typed Live ID and drops spaces and dashes people copy along with it. */
export function normalizeXboxLiveId(typed: string): string {
  return typed.replace(/[\s-]/g, "").toUpperCase();
}

/** True when the typed value looks like a real Xbox Live device ID. */
export function looksLikeXboxLiveId(typed: string): boolean {
  return LIVE_ID_PATTERN.test(normalizeXboxLiveId(typed));
}

/** A plain warning for a Live ID that does not look right, or null when it does. */
export function describeXboxLiveIdProblem(typed: string): string | null {
  if (looksLikeXboxLiveId(typed)) return null;
  return `That doesn't look like a Live ID (16 letters and numbers, usually starting with FD). ${XBOX_LIVE_ID_PATH}.`;
}
