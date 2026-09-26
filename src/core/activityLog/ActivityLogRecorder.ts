import { Device } from "../types/Device";
import { Command, CommandResult } from "../types/Command";
import {
  ActivityLogEntry,
  clampText,
  describeCommandError,
  MAX_DEVICE_ID_LENGTH,
  MAX_DEVICE_NAME_LENGTH,
  MAX_VERB_LENGTH,
  MAX_WHO_LENGTH,
} from "./activityLogEntry";
import { describeCommandVerb, isWorthLogging } from "./commandVerb";

// ADR-HEARTH-170: turns command outcomes into a bounded, offline-safe outbox of log entries. Pure:
// no network, no storage. The shipper drains it; `onChange` lets a storage layer persist it.

/** Oldest entries are dropped beyond this many waiting to be sent. */
export const MAX_PENDING_ENTRIES = 500;
/** The same person repeating the same action on the same device inside this window is one line, not twenty. */
export const REPEAT_WINDOW_MS = 5000;
const UNKNOWN_NAME = "Someone";

export interface ActivityLogRecorderDeps {
  /** The phone owner's display name right now. */
  getWho(): string;
  newId(): string;
  now(): number;
  /** Called with the full outbox after every change. */
  onChange?(pending: readonly ActivityLogEntry[]): void;
}

/** Collects entries for user-initiated commands until they are acknowledged as delivered. */
export class ActivityLogRecorder {
  private pending: ActivityLogEntry[];
  private lastSeenAt = new Map<string, number>();
  private recordedListeners = new Set<() => void>();

  constructor(private deps: ActivityLogRecorderDeps, restored: ActivityLogEntry[] = []) {
    this.pending = restored.slice(-MAX_PENDING_ENTRIES);
  }

  /** Records one finished command; never throws and ignores navigation noise and rapid repeats. */
  record(command: Command, device: Device, result: CommandResult): void {
    if (!isWorthLogging(command.capability, result.success)) return;
    const who = clampText(this.deps.getWho(), MAX_WHO_LENGTH, UNKNOWN_NAME);
    const verb = clampText(describeCommandVerb(command), MAX_VERB_LENGTH, "used");
    if (this.isRepeat(device.id, verb, who, result.success)) return;
    const entry: ActivityLogEntry = {
      id: this.deps.newId(),
      deviceId: device.id.slice(0, MAX_DEVICE_ID_LENGTH),
      deviceName: clampText(device.name, MAX_DEVICE_NAME_LENGTH, "a device"),
      verb,
      ok: result.success,
      ...(result.success || !result.error ? {} : { error: describeCommandError(result.error.code) }),
      at: new Date(result.timestamp).toISOString(),
      who,
    };
    this.pending = [...this.pending, entry].slice(-MAX_PENDING_ENTRIES);
    this.deps.onChange?.(this.pending);
    this.recordedListeners.forEach((listener) => listener());
  }

  /** Tells `listener` whenever a new entry is queued (used to schedule a delivery); returns an unsubscribe function. */
  onRecorded(listener: () => void): () => void {
    this.recordedListeners.add(listener);
    return () => this.recordedListeners.delete(listener);
  }

  /** Puts entries saved by an earlier run ahead of anything recorded since startup. */
  restore(saved: readonly ActivityLogEntry[]): void {
    if (saved.length === 0) return;
    this.pending = [...saved, ...this.pending].slice(-MAX_PENDING_ENTRIES);
    this.deps.onChange?.(this.pending);
  }

  /** The oldest `limit` entries still waiting to be delivered. */
  peek(limit: number): ActivityLogEntry[] {
    return this.pending.slice(0, limit);
  }

  /** Removes entries the Pi has accepted. */
  acknowledge(ids: readonly string[]): void {
    const delivered = new Set(ids);
    this.pending = this.pending.filter((entry) => !delivered.has(entry.id));
    this.deps.onChange?.(this.pending);
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  private isRepeat(deviceId: string, verb: string, who: string, ok: boolean): boolean {
    const key = `${deviceId}|${verb}|${who}|${ok}`;
    const now = this.deps.now();
    const previous = this.lastSeenAt.get(key);
    this.lastSeenAt.set(key, now);
    if (this.lastSeenAt.size > MAX_PENDING_ENTRIES) this.lastSeenAt.clear();
    return previous !== undefined && now - previous < REPEAT_WINDOW_MS;
  }
}
