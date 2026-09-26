import { useEffect, useRef, useState } from "react";
import { PairingSession, PairingSessionState, PairingStartOptions } from "../discovery/pairingSession";

export interface UsePairingSession {
  state: PairingSessionState;
  start: <T>(options: PairingStartOptions<T>) => void;
  retry: () => void;
  cancel: () => void;
}

/** Owns one PairingSession for a screen and disposes it (timers, sockets' late results) when the screen unmounts. */
export function usePairingSession(): UsePairingSession {
  const sessionRef = useRef<PairingSession | null>(null);
  if (sessionRef.current === null) sessionRef.current = new PairingSession();
  const session = sessionRef.current;
  const [state, setState] = useState<PairingSessionState>(session.getState());

  useEffect(() => {
    const unsubscribe = session.subscribe(setState);
    return () => {
      unsubscribe();
      session.dispose();
    };
  }, [session]);

  return {
    state,
    start: (options) => session.start(options),
    retry: () => session.retry(),
    cancel: () => session.cancel(),
  };
}
