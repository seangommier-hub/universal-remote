import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";

// ADR-HEARTH-167: when the Discover list is empty the screen says WHY (permission off, wrong
// Wi-Fi, Family Command Center unreachable, token rejected) and puts a button on the likeliest
// fix, instead of a generic "nothing found". Pure, so each cause's wording and action is tested.

export type EmptyAdviceKind = "all-added" | "none-found" | "unreachable" | "not-configured";

/** What a button does: open the phone's Settings for Hearth, scan again, or open Family Command Center setup. */
export type AdviceAction = "open-phone-settings" | "scan-again" | "setup-fcc";

export interface EmptyAdvice {
  icon: "checkmark-circle-outline" | "search-outline" | "cloud-offline-outline" | "home-outline" | "key-outline" | "wifi-outline";
  title: string;
  body: string | null;
  /** Likeliest causes, most probable first; empty when the cause is known. */
  reasons: string[];
  /** Buttons in priority order; the first is the primary one. */
  actions: AdviceAction[];
}

const NONE_FOUND_REASONS = [
  "Hearth's Local Network permission is off — turn it on in Settings.",
  "This phone is on a different Wi-Fi than your devices (guest or kids network).",
  "The devices are asleep or off. Turn one on, then scan again.",
  "Family Command Center is off or unplugged, so it can't scan for the phone.",
];

const UNREACHABLE_REASONS = [
  "Hearth's Local Network permission is off — turn it on in Settings.",
  "This phone isn't on your home Wi-Fi right now.",
  "Family Command Center is off, restarting or unplugged.",
  "iCloud Private Relay or Limit IP Address Tracking is on for this Wi-Fi.",
];

function unreachableAdvice(failure: NetworkFailureDiagnosis | null): EmptyAdvice {
  if (failure?.kind === "rejected-token") {
    return {
      icon: "key-outline",
      title: "Family Command Center said no",
      body: "It is reachable, but it no longer accepts this phone's saved key. Scan its QR code again.",
      reasons: [],
      actions: ["setup-fcc", "scan-again"],
    };
  }
  return { icon: "cloud-offline-outline", title: "Can't reach your home network", body: null, reasons: UNREACHABLE_REASONS, actions: ["open-phone-settings", "scan-again"] };
}

/** The message, likely causes and buttons for a Discover screen with nothing to list. */
export function adviceForEmptyScan(kind: EmptyAdviceKind, failure: NetworkFailureDiagnosis | null): EmptyAdvice {
  if (kind === "all-added") {
    return { icon: "checkmark-circle-outline", title: "Nothing new found", body: "Your devices are all added.", reasons: [], actions: ["scan-again"] };
  }
  if (kind === "not-configured") {
    return { icon: "home-outline", title: "Set up Family Command Center first", body: "It scans your network so Hearth can find every device.", reasons: [], actions: ["setup-fcc"] };
  }
  if (kind === "unreachable") return unreachableAdvice(failure);
  return { icon: "wifi-outline", title: "Nothing found right now", body: "Hearth scanned but saw no devices. The usual reasons:", reasons: NONE_FOUND_REASONS, actions: ["scan-again", "open-phone-settings"] };
}

export const ACTION_LABEL: Record<AdviceAction, string> = {
  "open-phone-settings": "Open Settings",
  "scan-again": "Scan again",
  "setup-fcc": "Set up Family Command Center",
};
