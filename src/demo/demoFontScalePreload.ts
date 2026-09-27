import { applyDemoFontScale } from "./demoFontScale";

/**
 * Must be App.tsx's first import (ADR-HEARTH-180): every screen's own `StyleSheet.create` call
 * reads `theme.type.*` once, at module-evaluation time — which happens for every screen App.tsx
 * transitively imports before any React component (including DemoGate, whose effect previously
 * called applyDemoFontScale — too late) ever mounts. This top-level call runs during Metro's
 * module evaluation itself, so it lands before those later imports' own `StyleSheet.create` calls
 * do. A no-op outside demo mode (see applyDemoFontScale's own doc comment).
 */
applyDemoFontScale();
