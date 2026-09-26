import type { FccConnection } from "../runnerConfig";

let connection: FccConnection | null = null;

/** Sets the Family Command Center connection every driver's FCC fallback will use. */
export function setFccConnection(next: FccConnection | null): void {
  connection = next;
}

/** Replaces src/discovery/familyCommandCenterConfig.ts's loader, reading the runner's config instead of AsyncStorage/SecureStore. */
export async function loadFamilyCommandCenterConfig(): Promise<FccConnection | null> {
  return connection;
}
