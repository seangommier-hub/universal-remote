import { theme } from "../ui/theme";
import { demoFontScaleParam } from "./demoMode";

type ThemeTypeScale = typeof theme.type;

/**
 * Multiplies every theme.type token in place by the demo-only ?fontScale= query param, so the
 * ui-verify harness (ADR-HEARTH-157) can approximate iOS Dynamic Type at larger accessibility
 * text sizes — Playwright has no way to emulate real Dynamic Type directly (ADR-HEARTH-180). A
 * no-op outside demo mode or when the param is absent/invalid (scale stays 1, theme untouched).
 * Mutates the shared `theme` object rather than threading a scale prop through every screen,
 * since dozens of screens already import it as a plain static module-level object, not a hook.
 * Must be called from demoFontScalePreload.ts (App.tsx's first import), not from a React effect —
 * every screen's own `StyleSheet.create` reads theme.type.* once, at module-evaluation time, which
 * happens before any component (including one calling this from an effect) ever mounts.
 */
export function applyDemoFontScale(): void {
  const scale = demoFontScaleParam();
  if (scale === 1) return;
  const mutableType = theme.type as unknown as Record<keyof ThemeTypeScale, number>;
  (Object.keys(theme.type) as (keyof ThemeTypeScale)[]).forEach((key) => {
    mutableType[key] = Math.round(theme.type[key] * scale);
  });
}
