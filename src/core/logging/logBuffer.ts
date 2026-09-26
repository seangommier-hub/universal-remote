import type { LogLevel } from "./logger";

/** Only warn and error lines are kept for remote diagnosis (ADR-HEARTH-146). */
export type BufferedLevel = Extract<LogLevel, "warn" | "error">;

export interface BufferedLogEntry {
  /** Monotonic sequence number, unique for the life of the process; lets a reader ask for "everything after N". */
  seq: number;
  t: number;
  level: BufferedLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

export const LOG_BUFFER_CAPACITY = 300;

let entries: BufferedLogEntry[] = [];
let nextSeq = 1;

/** Remembers a warn/error line in the in-memory ring; other levels are ignored. */
export function recordLogEntry(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>, now: number = Date.now()): void {
  if (level !== "warn" && level !== "error") return;
  entries.push({ seq: nextSeq++, t: now, level, scope, message, meta });
  if (entries.length > LOG_BUFFER_CAPACITY) entries = entries.slice(entries.length - LOG_BUFFER_CAPACITY);
}

/** Returns buffered entries newer than the given sequence number, oldest first. */
export function getLogEntriesAfter(seq: number): BufferedLogEntry[] {
  return entries.filter((entry) => entry.seq > seq);
}

/** Empties the buffer and restarts sequence numbering (tests only). */
export function resetLogBufferForTests(): void {
  entries = [];
  nextSeq = 1;
}
