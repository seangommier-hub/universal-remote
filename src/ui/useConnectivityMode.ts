import { useEffect, useState } from "react";
import { ConnectivityMode, getConnectivityMode, subscribeConnectivityMode } from "../core/network/fccConnectivity";

/** Live "home" / "away" / "unknown" state of how this phone last reached Family Command Center. */
export function useConnectivityMode(): ConnectivityMode {
  const [mode, setMode] = useState<ConnectivityMode>(getConnectivityMode);
  useEffect(() => {
    setMode(getConnectivityMode());
    return subscribeConnectivityMode(setMode);
  }, []);
  return mode;
}
