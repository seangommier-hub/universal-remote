import { useCallback, useEffect, useState } from "react";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { usesLegacySharedToken } from "../discovery/tokenUpgrade";
import { dismissTokenUpgradeBanner, isTokenUpgradeBannerDismissed } from "../runtime/tokenUpgradeBannerDismissal";

// Drives the one-time "a fresh pairing gets you a personal token" banner (ADR-HEARTH-181, phase 1).
// Purely informational -- never starts or forces a re-pair itself, only offers one.

export interface TokenUpgradeBannerControls {
  visible: boolean;
  /** Hides the banner for good on this phone. */
  dismiss: () => void;
}

/** Whether to show the token-upgrade nudge, re-checked whenever fccConfigured flips (e.g. right after a re-pair). */
export function useTokenUpgradeBanner(fccConfigured: boolean): TokenUpgradeBannerControls {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!fccConfigured) {
      setVisible(false);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const [config, dismissed] = await Promise.all([loadFamilyCommandCenterConfig(), isTokenUpgradeBannerDismissed()]);
      if (!cancelled) setVisible(!dismissed && usesLegacySharedToken(config));
    })();
    return () => {
      cancelled = true;
    };
  }, [fccConfigured]);

  const dismiss = useCallback(() => {
    setVisible(false);
    void dismissTokenUpgradeBanner();
  }, []);

  return { visible, dismiss };
}
