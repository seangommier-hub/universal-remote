import type { FamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// Whether this phone's saved Family Command Center connection is still using the legacy shared
// HEARTH_API_TOKEN rather than a personal one issued by pair/redeem (ADR-HEARTH-181, phase 1).
// A config saved before this field existed has no tokenKind at all, which is treated exactly like
// "legacy" -- there is no way to tell those two cases apart, and both need the same one-time nudge
// to re-pair for a personal token.

/** True when a saved connection exists and is not yet on a personal per-phone token. */
export function usesLegacySharedToken(config: FamilyCommandCenterConfig | null): boolean {
  return config !== null && config.tokenKind !== "personal";
}
