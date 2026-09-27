import { useCallback, useEffect, useMemo, useState } from "react";
import { BedtimeWindow } from "../core/kidMode/bedtimeWindow";
import { defaultKidModeSettings, KidModeSettings } from "../core/kidMode/kidModeSettings";
import { KidModeStatus, kidModeStatus } from "../core/kidMode/kidModeStatus";
import { logger } from "../core/logging/logger";
import { demoKidModeSettings } from "../demo/demoKidMode";
import { createKidPinVault } from "../runtime/createKidPinVault";
import { KidPinVault } from "../runtime/kidPinVault";
import { getKidModeSettings, initKidMode, seedKidModeForDemo, setKidModeSettings, subscribeKidMode } from "../runtime/kidModeState";

const LOG_SCOPE = "useKidMode";
const CLOCK_TICK_MS = 30_000;

export interface KidModeControls {
  /** False until the saved settings have been read; nothing should be shown as unrestricted before that. */
  ready: boolean;
  settings: KidModeSettings;
  status: KidModeStatus;
  vault: KidPinVault;
  /** Turns kid mode on; the caller has already made sure a PIN exists. */
  enable: () => void;
  /** Turns kid mode off; the caller has already checked the PIN. */
  disable: () => void;
  /** Sets the bedtime window, or removes it with undefined. */
  setBedtime: (window: BedtimeWindow | undefined) => void;
}

/** This phone's kid-mode settings, PIN vault and current status (off, restricted, or bedtime by the phone clock). */
export function useKidMode(): KidModeControls {
  const demo = useMemo(() => demoKidModeSettings(), []);
  const vault = useMemo(() => createKidPinVault(), []);
  const [ready, setReady] = useState(demo !== null);
  const [settings, setSettings] = useState<KidModeSettings>(() => demo ?? defaultKidModeSettings());
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (demo) {
      seedKidModeForDemo(demo);
    } else {
      initKidMode().then((loaded) => {
        setSettings(loaded);
        setReady(true);
      });
    }
    return subscribeKidMode(setSettings);
  }, [demo]);

  useEffect(() => {
    if (!settings.enabled || !settings.bedtime) return undefined;
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [settings.enabled, settings.bedtime]);

  const save = useCallback((next: KidModeSettings) => {
    setNow(new Date());
    setKidModeSettings(next).catch((error) => logger.warn(LOG_SCOPE, "could not save kid mode settings", { error: String(error) }));
  }, []);
  const enable = useCallback(() => save({ ...getKidModeSettings(), enabled: true }), [save]);
  const disable = useCallback(() => save({ ...getKidModeSettings(), enabled: false }), [save]);
  const setBedtime = useCallback(
    (window: BedtimeWindow | undefined) => {
      save({ enabled: getKidModeSettings().enabled, ...(window ? { bedtime: window } : {}) });
    },
    [save]
  );

  return { ready, settings, status: kidModeStatus(settings, now), vault, enable, disable, setBedtime };
}
