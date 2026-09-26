import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import { logger } from "../core/logging/logger";
import { joinHousehold } from "../discovery/joinHousehold";
import { learnPublicUrlIfMissing } from "../discovery/learnPublicUrl";
import { PAIR_LINK_PREFIX, parsePairInput } from "../discovery/pairInvite";
import { describePairFailure } from "./describePairFailure";

const LOG_SCOPE = "usePairLinkListener";

/** Reads a hearth://pair link from an incoming URL, or null when the URL is anything else. */
export function pairInviteFromUrl(url: string | null) {
  if (!url || !url.toLowerCase().startsWith(PAIR_LINK_PREFIX)) return null;
  return parsePairInput(url);
}

/** Joins the household when the app is opened from a hearth://pair link (cold start or while running), and quietly learns the public address at startup (ADR-HEARTH-149). */
export function usePairLinkListener(): void {
  const lastHandledUrl = useRef<string | null>(null);

  useEffect(() => {
    void learnPublicUrlIfMissing();

    async function handleUrl(url: string | null) {
      const invite = pairInviteFromUrl(url);
      if (!invite || url === lastHandledUrl.current) return;
      lastHandledUrl.current = url;
      try {
        await joinHousehold(invite);
        Alert.alert("Connected", "This phone is now connected to your home.");
      } catch (error) {
        logger.warn(LOG_SCOPE, "Joining from a link failed", { message: error instanceof Error ? error.message : String(error) });
        const notice = describePairFailure(error);
        Alert.alert("Couldn't join", notice.message ?? notice.diagnosis?.message ?? "Something went wrong.");
      }
    }

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", (event) => void handleUrl(event.url));
    return () => subscription.remove();
  }, []);
}
