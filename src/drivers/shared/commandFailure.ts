// ADR-HEARTH-171: the shared half of the connection contract's "a failed command marks the driver
// disconnected and starts the reconnect loop" rule. A bad argument never touched the device, so it
// must not be mistaken for a dead one.

/** Thrown for a command rejected before any network I/O (bad argument, unsupported capability); never evidence the device is unreachable. */
export class CommandValidationError extends Error {}

/** Runs a command against the device; if it fails for any reason other than validation, calls onUnreachable before rethrowing the original error. */
export async function runCommandTrackingReachability<T>(run: () => Promise<T>, onUnreachable: () => void): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof CommandValidationError)) onUnreachable();
    throw err;
  }
}
