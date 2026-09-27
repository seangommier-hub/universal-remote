import { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

// Pure content logic for the "what leaves your house" screen (ADR-HEARTH-186), split out from the
// screen component so the branching that decides which lines to show is unit-testable without
// rendering React Native. Every line built here must be traceable to real, currently-shipped
// behavior — see ADR-HEARTH-186 for the audit each entry is drawn from.

export type PrivacyEntryIcon = ComponentProps<typeof Ionicons>["name"];

export interface PrivacyEntry {
  icon: PrivacyEntryIcon;
  text: string;
}

/** Builds the disclosure list — only mentions an integration's egress path when that integration is actually configured, so the screen never claims something happens that isn't wired up. */
export function buildPrivacyEntries(hasAwayAddress: boolean, hasHomeAssistant: boolean, hasSwitchBot: boolean): PrivacyEntry[] {
  const entries: PrivacyEntry[] = [
    {
      icon: "home-outline",
      text: "On your home WiFi, device commands go straight from this phone to Family Command Center over your own network — they never touch any outside server.",
    },
  ];
  entries.push(
    hasAwayAddress
      ? {
          icon: "cloud-outline",
          text: "When you're away from home, device commands travel through Family Command Center's own Cloudflare tunnel to reach it, then on to your devices.",
        }
      : {
          icon: "cloud-offline-outline",
          text: "No away-from-home address is set up, so device commands only work while your phone is on the home WiFi.",
        }
  );
  if (hasHomeAssistant) {
    entries.push({
      icon: "git-network-outline",
      text: "You've connected Home Assistant. Its address and any commands you send it go directly from this phone to wherever you configured Home Assistant to reach — your home network or its own remote-access setup — never through Family Command Center.",
    });
  }
  if (hasSwitchBot) {
    entries.push({
      icon: "cloud-upload-outline",
      text: "You've connected a SwitchBot device. Commands to it go directly from this phone to SwitchBot's own cloud servers (api.switch-bot.com) using the token you created in the SwitchBot app — not through Family Command Center.",
    });
  }
  entries.push(
    {
      icon: "document-text-outline",
      text: "Warning and error log lines from this phone are redacted (tokens and passwords stripped) and sent to Family Command Center only, at most once a minute — never to Anthropic, Expo, or anyone else. There is no crash-reporting or analytics service in this app at all.",
    },
    {
      icon: "cloud-download-outline",
      text: "App updates are checked for and downloaded from Expo's own update servers (EAS Update) — that's a real check-in with Expo, not Family Command Center.",
    }
  );
  return entries;
}

/** True when nothing beyond the always-present entries (device commands, logs, updates) applies — the closing "Nothing else leaves this house" line is only honest to show in that case. */
export function nothingElseLeaves(hasHomeAssistant: boolean, hasSwitchBot: boolean): boolean {
  return !hasHomeAssistant && !hasSwitchBot;
}
