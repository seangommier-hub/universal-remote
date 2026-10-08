import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutChangeEvent } from "react-native";
import { FIT_SCALE_CEILING, FIT_SCALE_GROW_CEILING, nextFitScale } from "./fitScale";

// Thin React wiring around fitScale.ts (the real, framework-free math — see its own header
// comment for the full story). This hook owns the measure -> correct -> re-measure loop so
// UniversalTvRemote.tsx only has to wire two props onto its existing ScrollView and read one
// number back.

// Defensive hard stop, independent of fitScale.ts's own floor -- protects against an unforeseen
// source of measurement jitter (e.g. async web font loading nudging text metrics by a px between
// layouts) turning into an endless render loop. The proportional estimate undershoots by design
// (fitScale.ts's own comment), so closing the last few px of a real correction legitimately takes
// more than a couple of steps; 20 is still a hard, small bound -- each step is one layout pass, no
// animation or timer involved, so even the full count resolves well within a single frame budget.
const MAX_CORRECTION_STEPS = 30;

// ADR-HEARTH-219: the remote also GROWS into spare height (Pro Max vs. Pro), but the width-derived
// scale (useResponsiveScale, up to 1.35) already enlarges it on wide screens -- this caps the
// COMBINED size so a tablet-sized window never gets cartoonishly large controls.
const MAX_COMBINED_SCALE = 1.6;

// A resize smaller than this (px) is treated as noise, not a real viewport change -- avoids
// re-running the whole correction sequence over sub-pixel layout rounding.
const RESIZE_RESET_THRESHOLD_PX = 4;

export interface RemoteFitScale {
  /** Multiply this screen's own fit-aware sizes (see call sites) by this -- 1 whenever the
   * content already fits, shrinking only while it measurably doesn't. */
  fitScale: number;
  /** Wire onto the ScrollView itself (not its contentContainerStyle) -- its own rendered height
   * is the real "available height" this screen has to fill without scrolling. */
  onLayout: (event: LayoutChangeEvent) => void;
  /** Wire onto the same ScrollView's onContentSizeChange -- react-native-web fires this from the
   * content container's own onLayout (see ScrollView's implementation), giving the actual
   * rendered height of everything stacked inside, at the current fitScale. */
  onContentSizeChange: (width: number, height: number) => void;
}

/**
 * Converges a corrective scale factor so a screen's actual rendered content height fits its
 * actual available height, without scrolling -- the height-aware counterpart to
 * useResponsiveScale's width-only scaling (see ADR-HEARTH-040, which deliberately never measures
 * or reacts to height at all). `resetKey` should change whenever the rendered content set
 * meaningfully changes (e.g. a different device, or a different tab on the same device) --
 * switching back to a smaller/simpler piece of content shouldn't stay shrunk from a previous,
 * taller one; starting back over at fitScale=1 and re-converging (shrinking again only if this
 * new content also overflows) is cheap enough to be invisible for content this size, and is
 * simpler and more obviously correct than trying to grow a shrunk scale back up without ever
 * overshooting into fresh overflow.
 */
export function useRemoteFitScale(resetKey: string, widthScale: number = 1): RemoteFitScale {
  const maxFitScale = Math.max(FIT_SCALE_CEILING, Math.min(FIT_SCALE_GROW_CEILING, MAX_COMBINED_SCALE / widthScale));
  const [fitScale, setFitScale] = useState(FIT_SCALE_CEILING);
  const availableHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const stepsRef = useRef(0);
  const resetKeyRef = useRef(resetKey);

  const attemptCorrection = useCallback(() => {
    const availableHeight = availableHeightRef.current;
    const contentHeight = contentHeightRef.current;
    if (availableHeight <= 0 || contentHeight <= 0) return;
    if (stepsRef.current >= MAX_CORRECTION_STEPS) return;
    setFitScale((current) => {
      const next = nextFitScale(current, availableHeight, contentHeight, maxFitScale);
      if (Math.abs(next - current) < 0.001) return current; // already converged -- no-op, no re-render
      stepsRef.current += 1;
      return next;
    });
  }, [maxFitScale]);

  // A different device, or a different tab on the same device, is different content -- re-run
  // the correction from scratch rather than carrying over a shrink that applied to something else.
  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    stepsRef.current = 0;
    contentHeightRef.current = 0; // the next onContentSizeChange for the new content starts this fresh
    setFitScale(FIT_SCALE_CEILING);
  }, [resetKey]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      if (Math.abs(height - availableHeightRef.current) > RESIZE_RESET_THRESHOLD_PX) {
        // A real viewport change (e.g. rotation, a resizable window) can only be answered by
        // starting the correction over -- this function only ever shrinks (see fitScale.ts), so
        // the one way to recover headroom a bigger viewport just created is to retry from 1.0.
        stepsRef.current = 0;
        setFitScale(FIT_SCALE_CEILING);
      }
      availableHeightRef.current = height;
      attemptCorrection();
    },
    [attemptCorrection]
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      attemptCorrection();
    },
    [attemptCorrection]
  );

  return { fitScale, onLayout, onContentSizeChange };
}
