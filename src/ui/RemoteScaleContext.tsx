import { createContext, ReactNode, useContext, useMemo } from "react";
import { scaleFont, scaleSize } from "./remoteScale";

const UNSCALED = 1;

const RemoteScaleContext = createContext<number>(UNSCALED);

/** Provides the remote screen's total scale to every control beneath it (ADR-HEARTH-219). */
export function RemoteScaleProvider({ scale, children }: { scale: number; children: ReactNode }) {
  return <RemoteScaleContext.Provider value={scale}>{children}</RemoteScaleContext.Provider>;
}

export interface RemoteScaled {
  /** The remote's total scale (1 outside the remote screen, so shared controls render unchanged). */
  scale: number;
  /** Scales a layout size (padding, gap, height, radius, icon) by the total scale. */
  size: (base: number) => number;
  /** Scales a font size by the total scale, clamped to the legibility band. */
  font: (base: number) => number;
}

/** Returns the remote's total scale plus the size/font helpers that apply it. */
export function useRemoteScaled(): RemoteScaled {
  const scale = useContext(RemoteScaleContext);
  return useMemo(() => ({ scale, size: (base: number) => scaleSize(base, scale), font: (base: number) => scaleFont(base, scale) }), [scale]);
}
