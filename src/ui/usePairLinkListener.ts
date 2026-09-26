import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import { learnPublicUrlIfMissing } from "../discovery/learnPublicUrl";
import { PAIR_LINK_PREFIX, parsePairInput } from "../discovery/pairInvite";
import { navigateToDevicesTab } from "./appNavigation";
import { offerPendingPairInvite } from "./pendingPairInvite";

/** Reads a hearth://pair link from an incoming URL, or null when the URL is anything else. */
export function pairInviteFromUrl(url: string | null) {
  if (!url || !url.toLowerCase().startsWith(PAIR_LINK_PREFIX)) return null;
  return parsePairInput(url);
}

/** Routes an incoming hearth://pair link to the Join screen for confirmation; never joins on its own (ADR-HEARTH-160). Also quietly learns the public address at startup (ADR-HEARTH-149). */
export function usePairLinkListener(): void {
  const lastHandledUrl = useRef<string | null>(null);

  useEffect(() => {
    void learnPublicUrlIfMissing();

    function handleUrl(url: string | null) {
      const invite = pairInviteFromUrl(url);
      if (!invite || url === lastHandledUrl.current) return;
      lastHandledUrl.current = url;
      offerPendingPairInvite(invite);
      navigateToDevicesTab();
    }

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);
}
